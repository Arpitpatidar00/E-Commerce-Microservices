import { FastifyInstance } from 'fastify';
import { setupGracefulShutdown } from '../middleware';

export const startServer = async (
  app: FastifyInstance,
  port: number,
  serviceName: string,
  cleanupTasks: (() => Promise<void>)[] = []
) => {
  // @ts-ignore
  setupGracefulShutdown(app, cleanupTasks);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`${serviceName} is running on port ${port}`);
  } catch (err) {
    app.log.error(err, `Failed to start ${serviceName}`);
    process.exit(1);
  }
};
