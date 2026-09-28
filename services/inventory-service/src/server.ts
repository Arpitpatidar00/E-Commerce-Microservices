import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import { startServer, connectMongo } from '@ecommerce/shared';
import mongoose from 'mongoose';
import { startOrderEventsConsumer } from './consumers/orderEventsConsumer';

const start = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_inventory';
  await connectMongo(mongoUri, 'inventory-service');

  const app = buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3004;
  
  await startServer(app, port, 'Inventory Service', [
    async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
  ]);
};

startOrderEventsConsumer().catch((err) => {
  console.error('Order events consumer crashed', err);
  process.exit(1);
});

start();
