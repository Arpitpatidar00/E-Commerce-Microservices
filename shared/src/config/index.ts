import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  REDIS_URI: z.string().default('redis://localhost:6379'),
  MONGO_URI: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
});

type Config = z.infer<typeof envSchema>;

let configCache: Config | null = null;

export const getConfig = (): Config => {
  if (!configCache) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error('Environment validation failed:', parsed.error.format());
      throw new Error('Invalid environment variables');
    }
    configCache = parsed.data;
  }
  return configCache;
};
