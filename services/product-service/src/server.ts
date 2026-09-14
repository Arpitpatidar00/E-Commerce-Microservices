import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import { startServer, connectMongo } from '@ecommerce/shared';
import mongoose from 'mongoose';
import { redisClient } from './config/db';

const start = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_product';
  await connectMongo(mongoUri, 'product-service');

  const app = buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;
  
  // @ts-ignore
  await startServer(app, port, 'Product Service', [
    async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    },
    async () => {
      await redisClient.quit();
      console.log('Redis connection closed.');
    }
  ]);
};

start();
