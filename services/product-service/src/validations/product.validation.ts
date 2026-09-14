import { z } from 'zod';

export const createProductRequestSchema = z.object({
  name: z.string().min(2),
  description: z.string(),
  price: z.number().min(0)
});

export const getProductsQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10)
});

export const productIdSchema = z.object({
  id: z.string()
});
