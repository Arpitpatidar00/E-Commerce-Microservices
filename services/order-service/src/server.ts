import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import { startServer } from '@ecommerce/shared';
import './db'; // This will connect to PostgreSQL via pool

const start = async () => {
  const app = buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;
  
  // @ts-ignore
  await startServer(app, port, 'Order Service', [
    async () => { console.log('Closing DB connections...'); }
  ]);
};

start();
