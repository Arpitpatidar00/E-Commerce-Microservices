import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import { startServer } from '@ecommerce/shared';
import { pool } from './db';
import { startOutboxRelay } from './workers/outboxRelay';
import { startInventoryEventsConsumer } from './consumers/inventoryEventsConsumer';

const start = async () => {
  const app = buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;
  
  await startServer(app, port, 'Order Service', [
    async () => {
      await pool.end();
      console.log('PostgreSQL connection closed.');
    }
  ]);
};

startOutboxRelay().catch((err) => {
  console.error('Outbox relay crashed', err);
  process.exit(1);
});

startInventoryEventsConsumer().catch((err) => {
  console.error('Inventory events consumer crashed', err);
  process.exit(1);
});

start();
