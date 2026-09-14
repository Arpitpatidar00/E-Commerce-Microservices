import { z } from 'zod';

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2)
});

export const loginUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string()
});
