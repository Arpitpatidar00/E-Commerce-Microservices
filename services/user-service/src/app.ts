import { FastifyInstance } from 'fastify';
import authRoutes from './routes/auth';
import { buildCoreApp } from '@ecommerce/shared';

export const buildApp = (): FastifyInstance => {
  const app = buildCoreApp('user-service');

  app.register(authRoutes, { prefix: '/api/users/auth' });

  return app;
};
