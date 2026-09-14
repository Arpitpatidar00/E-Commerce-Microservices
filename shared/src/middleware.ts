import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export const setupCorrelationId = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || randomUUID();
    request.headers['x-correlation-id'] = correlationId;
    reply.header('X-Correlation-ID', correlationId);
    
    // Add correlationId to the request logger
    request.log = request.log.child({ correlationId });
  });
};

export const setupGracefulShutdown = (app: FastifyInstance, cleanupTasks: (() => Promise<void>)[]) => {
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);
    
    try {
      await app.close();
      app.log.info('Fastify server closed.');
      
      for (const task of cleanupTasks) {
        await task();
      }
      
      app.log.info('Cleanup tasks completed. Exiting.');
      process.exit(0);
    } catch (err) {
      app.log.error(err as object, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};
