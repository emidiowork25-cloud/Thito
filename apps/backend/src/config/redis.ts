import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient>;

export async function initializeRedis() {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => console.error('Redis error:', err));
  redisClient.on('connect', () => console.log('Redis connected'));

  await redisClient.connect();
}

export function getRedisClient() {
  return redisClient;
}
