import { FastifyInstance } from 'fastify';
import orderRoutes from './routes/order';
import { buildCoreApp } from '@ecommerce/shared';

export const buildApp = (): FastifyInstance => {
  const app = buildCoreApp('order-service');
  // @ts-ignore
  app.register(orderRoutes, { prefix: '/api/orders' });
  // @ts-ignore
  return app;
};
