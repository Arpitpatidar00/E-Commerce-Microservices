import { FastifyInstance } from 'fastify';
import inventoryRoutes from './routes/inventory';
import { buildCoreApp } from '@ecommerce/shared';

export const buildApp = (): FastifyInstance => {
  const app = buildCoreApp('inventory-service');
  app.register(inventoryRoutes, { prefix: '/api/inventory' });
  return app;
};
