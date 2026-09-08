import { z } from 'zod';

/*
 * Every string is bounded. An unbounded field is both a denial-of-service
 * vector (megabytes parsed and hashed per request) and a way to bloat rows
 * that are later read back on every page load.
 */

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

// NIST 800-63B: length beats composition rules, which push people toward
// predictable substitutions. Length floor plus a deny-list of the passwords
// credential-stuffing lists try first.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'senha123', 'qwerty123',
  'abc12345', '11111111', 'iloveyou', 'admin123', 'chapaquente', 'hamburguer',
]);

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(200, 'Senha longa demais')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Essa senha é fácil de adivinhar. Escolha outra.',
  });

export const uuidSchema = z.string().uuid();

const nameSchema = z.string().trim().min(2, 'Nome muito curto').max(100);
const shortText = z.string().trim().max(500);
const longText = z.string().trim().max(2000);

// .strict() rejects unknown keys so a caller cannot smuggle in a field a
// future version might start trusting.
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
    userType: z.enum(['customer', 'store']),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().max(200),
  })
  .strict();

export const createMenuItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: shortText.optional(),
    ingredients: longText.optional(),
    // Bounded above so a typo cannot create a six-figure item, and rounded to
    // cents so no fraction survives into the order total.
    price: z
      .number()
      .positive('Preço precisa ser maior que zero')
      .max(100000, 'Preço acima do limite')
      .multipleOf(0.01, 'Preço deve ter no máximo 2 casas decimais'),
    category: z.string().trim().max(60).optional(),
    imageUrl: z.string().url().max(1000).optional(),
  })
  .strict();

export const updateMenuItemSchema = createMenuItemSchema
  .partial()
  .extend({ isAvailable: z.boolean().optional() })
  .strict();

const customizationList = z.array(z.string().trim().min(1).max(60)).max(30);

export const createOrderSchema = z
  .object({
    storeId: uuidSchema,
    items: z
      .array(
        z
          .object({
            menuItemId: uuidSchema,
            quantity: z.number().int().positive().max(99),
            notes: shortText.optional(),
            customizations: z
              .object({
                removed: customizationList.optional(),
                added: customizationList.optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
      )
      .min(1, 'O pedido precisa de pelo menos um item')
      .max(50, 'Pedido com itens demais'),
    notes: shortText.optional(),
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
    estimatedTime: z.number().int().positive().max(600).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
