import { z } from 'zod';

export const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1)
});

export const createOrderRequestSchema = z.object({
  userId: z.string(),
  items: z.array(orderItemSchema).min(1)
});

export const orderIdSchema = z.object({
  id: z.string().transform(val => {
    const parsed = parseInt(val);
    if (isNaN(parsed)) throw new Error('Invalid ID');
    return parsed;
  })
});
