import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRATION: z.string().default('7d'),
  BACKEND_PORT: z.string().default('5000').transform(Number),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
