import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'express-async-errors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

import { initializeDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import authRoutes from './routes/auth';
import menuRoutes from './routes/menu';
import ordersRoutes from './routes/orders';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', ordersRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
    },
  });
});

// Start server
const PORT = process.env.BACKEND_PORT || 5000;

async function start() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database connected');

    // Initialize Redis
    await initializeRedis();
    console.log('✅ Redis connected');

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
    });

    // WebSocket connection
    io.on('connection', (socket) => {
      console.log(`👤 User connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`👤 User disconnected: ${socket.id}`);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
