import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import pino from 'pino';

const logger = pino({ level: 'info' });

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecommerce_order';

const pool = new Pool({
  connectionString,
});

pool.on('connect', () => {
  logger.info('PostgreSQL connected');
});

pool.on('error', (err) => {
  logger.error(err, 'Unexpected error on idle client');
  process.exit(-1);
});

export const db = drizzle(pool, { schema });
