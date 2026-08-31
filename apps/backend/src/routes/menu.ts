import { Router, Response } from 'express';
import { getPool } from '../config/database';
import { verifyToken, requireStore, AuthRequest } from '../middleware/auth';
import { createMenuItemSchema, updateMenuItemSchema } from '../utils/validation';

const router = Router();

// Get menu for a store (public)
router.get('/', async (req, res) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ error: { message: 'storeId is required' } });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, description, ingredients, price, category, image_url as imageUrl, is_available as isAvailable
       FROM menu_items
       WHERE store_id = $1 AND is_available = true
       ORDER BY category, name`,
      [storeId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch menu' } });
  }
});

// Get menu categories for a store (public)
router.get('/categories', async (req, res) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ error: { message: 'storeId is required' } });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT DISTINCT category FROM menu_items
       WHERE store_id = $1 AND is_available = true AND category IS NOT NULL
       ORDER BY category`,
      [storeId]
    );

    res.json(result.rows.map(row => row.category));
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch categories' } });
  }
});

// Get single menu item (public)
router.get('/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, name, description, ingredients, price, category, image_url as imageUrl, is_available as isAvailable
       FROM menu_items
       WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Menu item not found' } });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch menu item' } });
  }
});

// Create menu item (store only)
router.post('/', verifyToken, requireStore, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createMenuItemSchema.parse(req.body);
    const pool = getPool();

    // Get store ID for this user
    const storeResult = await pool.query(
      'SELECT id FROM stores WHERE user_id = $1',
      [req.userId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Store not found' } });
    }

    const storeId = storeResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO menu_items (store_id, name, description, ingredients, price, category, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, ingredients, price, category, image_url as imageUrl, is_available as isAvailable`,
      [storeId, parsed.name, parsed.description, parsed.ingredients, parsed.price, parsed.category, parsed.imageUrl]
    );

    // Create inventory entry
    await pool.query(
      'INSERT INTO inventory (menu_item_id) VALUES ($1)',
      [result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: 'Failed to create menu item' } });
  }
});

// Update menu item (store only)
router.put('/:itemId', verifyToken, requireStore, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const parsed = updateMenuItemSchema.parse(req.body);
    const pool = getPool();

    // Verify ownership
    const itemResult = await pool.query(
      `SELECT mi.id FROM menu_items mi
       JOIN stores s ON mi.store_id = s.id
       WHERE mi.id = $1 AND s.user_id = $2`,
      [itemId, req.userId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Menu item not found' } });
    }

    const updates = [];
    const values: any[] = [];
    let paramCount = 1;

    if (parsed.name) {
      updates.push(`name = $${paramCount}`);
      values.push(parsed.name);
      paramCount++;
    }
    if (parsed.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(parsed.description);
      paramCount++;
    }
    if (parsed.ingredients !== undefined) {
      updates.push(`ingredients = $${paramCount}`);
      values.push(parsed.ingredients);
      paramCount++;
    }
    if (parsed.price) {
      updates.push(`price = $${paramCount}`);
      values.push(parsed.price);
      paramCount++;
    }
    if (parsed.category !== undefined) {
      updates.push(`category = $${paramCount}`);
      values.push(parsed.category);
      paramCount++;
    }
    if (parsed.imageUrl !== undefined) {
      updates.push(`image_url = $${paramCount}`);
      values.push(parsed.imageUrl);
      paramCount++;
    }
    if (parsed.isAvailable !== undefined) {
      updates.push(`is_available = $${paramCount}`);
      values.push(parsed.isAvailable);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    values.push(itemId);

    const result = await pool.query(
      `UPDATE menu_items SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING id, name, description, ingredients, price, category, image_url as imageUrl, is_available as isAvailable`,
      values
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: 'Failed to update menu item' } });
  }
});

// Delete menu item (store only)
router.delete('/:itemId', verifyToken, requireStore, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const pool = getPool();

    // Verify ownership
    const itemResult = await pool.query(
      `SELECT mi.id FROM menu_items mi
       JOIN stores s ON mi.store_id = s.id
       WHERE mi.id = $1 AND s.user_id = $2`,
      [itemId, req.userId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Menu item not found' } });
    }

    await pool.query('DELETE FROM menu_items WHERE id = $1', [itemId]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to delete menu item' } });
  }
});

export default router;
