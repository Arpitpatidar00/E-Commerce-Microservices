import { FastifyInstance } from 'fastify';
import productRoutes from './routes/product';
import { buildCoreApp } from '@ecommerce/shared';

export const buildApp = (): FastifyInstance => {
  const app = buildCoreApp('product-service');
  app.register(productRoutes, { prefix: '/api/products' });
  return app;
};
