import fastify, { FastifyInstance } from 'fastify';
import { setupCorrelationId } from '../middleware';
import { idempotencyMiddleware } from '../idempotency';
import { metricsPlugin } from '../plugins/metrics';
import { errorHandler } from '../errors/errorHandler';

export const buildCoreApp = (serviceName: string): FastifyInstance => {
  const app = fastify({ logger: true });

  // Common Middleware
  setupCorrelationId(app);
  idempotencyMiddleware(app, serviceName);

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Common Plugins
  app.register(metricsPlugin, { appName: serviceName });

  // Standard Health Check
  app.get('/health', async () => {
    return { status: 'ok', service: serviceName };
  });

  return app;
};
