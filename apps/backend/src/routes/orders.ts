import { Router, Response } from 'express';
import { getPool } from '../config/database';
import { getRedisClient } from '../config/redis';
import { verifyToken, requireCustomer, requireStore, AuthRequest } from '../middleware/auth';
import { createOrderSchema, updateOrderStatusSchema } from '../utils/validation';

const router = Router();

// Create order (customer)
router.post('/', verifyToken, requireCustomer, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createOrderSchema.parse(req.body);
    const pool = getPool();
    const redis = getRedisClient();

    // Verify store exists
    const storeCheck = await pool.query('SELECT id FROM stores WHERE id = $1', [parsed.storeId]);
    if (storeCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Store not found' } });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let totalPrice = 0;
      const orderItems = [];

      // Validate and calculate items
      for (const item of parsed.items) {
        const itemResult = await client.query(
          `SELECT id, price FROM menu_items WHERE id = $1 AND store_id = $2 AND is_available = true`,
          [item.menuItemId, parsed.storeId]
        );

        if (itemResult.rows.length === 0) {
          throw new Error(`Menu item ${item.menuItemId} not found or unavailable`);
        }

        const price = parseFloat(itemResult.rows[0].price);
        const subtotal = price * item.quantity;
        totalPrice += subtotal;

        orderItems.push({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: price,
          subtotal,
          notes: item.notes || null,
          customizations: item.customizations || null,
        });
      }

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (store_id, customer_id, total_price, notes, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, store_id, status, total_price, created_at`,
        [parsed.storeId, req.userId, totalPrice, parsed.notes || null, 'pending']
      );

      const order = orderResult.rows[0];

      // Create order items
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, notes, customizations)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, item.menuItemId, item.quantity, item.unitPrice, item.subtotal, item.notes,
           item.customizations ? JSON.stringify(item.customizations) : null]
        );
      }

      await client.query('COMMIT');

      // Publish order to Redis (for WebSocket)
      await redis.publish(`store:${parsed.storeId}`, JSON.stringify({
        event: 'order:created',
        orderId: order.id,
        storeId: parsed.storeId,
        status: order.status,
        totalPrice: order.total_price,
        timestamp: new Date().toISOString(),
      }));

      res.status(201).json({
        orderId: order.id,
        storeId: order.store_id,
        status: order.status,
        totalPrice: order.total_price,
        createdAt: order.created_at,
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: error.message || 'Failed to create order' } });
  }
});

// Get orders for customer
router.get('/', verifyToken, requireCustomer, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, store_id, status, total_price, notes, created_at, updated_at
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.userId]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      storeId: row.store_id,
      status: row.status,
      totalPrice: row.total_price,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch orders' } });
  }
});

// Get single order (customer or store owner)
router.get('/:orderId', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const pool = getPool();

    const orderResult = await pool.query(
      `SELECT id, store_id, customer_id, status, total_price, notes, estimated_time_minutes, created_at, updated_at
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Order not found' } });
    }

    const order = orderResult.rows[0];

    // Check authorization (customer who made it or store owner)
    if (req.userType === 'customer' && order.customer_id !== req.userId) {
      return res.status(403).json({ error: { message: 'Unauthorized' } });
    }

    if (req.userType === 'store') {
      const storeCheck = await pool.query(
        'SELECT id FROM stores WHERE id = $1 AND user_id = $2',
        [order.store_id, req.userId]
      );
      if (storeCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'Unauthorized' } });
      }
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.id, oi.menu_item_id, mi.name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes, oi.customizations
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({
      id: order.id,
      storeId: order.store_id,
      status: order.status,
      totalPrice: order.total_price,
      notes: order.notes,
      estimatedTimeMinutes: order.estimated_time_minutes,
      items: itemsResult.rows.map(row => ({
        id: row.id,
        menuItemId: row.menu_item_id,
        name: row.name,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        subtotal: row.subtotal,
        notes: row.notes,
        customizations: row.customizations,
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch order' } });
  }
});

// Update order status (store only)
router.patch('/:orderId/status', verifyToken, requireStore, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const parsed = updateOrderStatusSchema.parse(req.body);
    const pool = getPool();
    const redis = getRedisClient();

    // Verify ownership
    const orderResult = await pool.query(
      `SELECT o.id, o.store_id FROM orders o
       JOIN stores s ON o.store_id = s.id
       WHERE o.id = $1 AND s.user_id = $2`,
      [orderId, req.userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Order not found' } });
    }

    const order = orderResult.rows[0];

    const result = await pool.query(
      `UPDATE orders
       SET status = $1, estimated_time_minutes = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, status, estimated_time_minutes, updated_at`,
      [parsed.status, parsed.estimatedTime || null, orderId]
    );

    const updatedOrder = result.rows[0];

    // Publish update to Redis (for WebSocket)
    await redis.publish(`order:${orderId}`, JSON.stringify({
      event: 'order:status',
      orderId: orderId,
      status: updatedOrder.status,
      estimatedTimeMinutes: updatedOrder.estimated_time_minutes,
      timestamp: new Date().toISOString(),
    }));

    await redis.publish(`store:${order.store_id}`, JSON.stringify({
      event: 'order:status',
      orderId: orderId,
      status: updatedOrder.status,
      estimatedTimeMinutes: updatedOrder.estimated_time_minutes,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      id: updatedOrder.id,
      status: updatedOrder.status,
      estimatedTimeMinutes: updatedOrder.estimated_time_minutes,
      updatedAt: updatedOrder.updated_at,
    });
  } catch (error: any) {
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: 'Failed to update order status' } });
  }
});

// Get orders for store dashboard (store only)
router.get('/store/dashboard', verifyToken, requireStore, async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const pool = getPool();

    // Get store ID
    const storeResult = await pool.query(
      'SELECT id FROM stores WHERE user_id = $1',
      [req.userId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Store not found' } });
    }

    const storeId = storeResult.rows[0].id;

    let query = `SELECT o.id, o.customer_id, o.status, o.total_price, o.notes, o.estimated_time_minutes, o.created_at, o.updated_at
                 FROM orders o
                 WHERE o.store_id = $1`;
    const values: any[] = [storeId];
    let paramCount = 2;

    if (status && status !== 'all') {
      query += ` AND o.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM orders WHERE store_id = $1`;
    const countValues: any[] = [storeId];
    if (status && status !== 'all') {
      countQuery += ` AND status = $2`;
      countValues.push(status);
    }
    const countResult = await pool.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      orders: result.rows.map(row => ({
        id: row.id,
        customerId: row.customer_id,
        status: row.status,
        totalPrice: row.total_price,
        notes: row.notes,
        estimatedTimeMinutes: row.estimated_time_minutes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch store orders' } });
  }
});

export default router;
