import { z } from 'zod';

export const emailSchema = z.string().email();
export const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
export const uuidSchema = z.string().uuid();

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2),
  userType: z.enum(['customer', 'store']),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string(),
});

export const createMenuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});

export const createOrderSchema = z.object({
  storeId: uuidSchema,
  items: z.array(
    z.object({
      menuItemId: uuidSchema,
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    })
  ),
  notes: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
  estimatedTime: z.number().int().positive().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
