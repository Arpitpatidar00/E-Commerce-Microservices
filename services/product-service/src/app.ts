import { FastifyInstance } from 'fastify';
import productRoutes from './routes/product';
import { buildCoreApp } from '@ecommerce/shared';

export const buildApp = (): FastifyInstance => {
  const app = buildCoreApp('product-service');
  // @ts-ignore
  app.register(productRoutes, { prefix: '/api/products' });
  // @ts-ignore
  return app;
};
