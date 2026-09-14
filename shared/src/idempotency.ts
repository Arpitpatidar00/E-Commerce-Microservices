import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');

export const idempotencyMiddleware = (app: FastifyInstance) => {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      const idempotencyKey = request.headers['idempotency-key'] as string;
      
      if (!idempotencyKey) {
        // Enforce idempotency key in production, but let it pass for development if not strict
        return reply.status(400).send({ error: 'Idempotency-Key header is required' });
      }

      const cacheKey = `idempotency:${idempotencyKey}`;
      const cachedResponse = await redis.get(cacheKey);

      if (cachedResponse) {
        const { statusCode, payload, headers } = JSON.parse(cachedResponse);
        reply.status(statusCode).headers(headers).send(payload);
        return reply; // stop processing
      }
      
      // Mark as in-progress to prevent race conditions on double click
      const setInProgess = await redis.set(cacheKey, 'IN_PROGRESS', 'EX', 10, 'NX');
      if (!setInProgess) {
        return reply.status(409).send({ error: 'Request is already being processed' });
      }
    }
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      const idempotencyKey = request.headers['idempotency-key'] as string;
      if (idempotencyKey && reply.statusCode >= 200 && reply.statusCode < 300) {
        const cacheKey = `idempotency:${idempotencyKey}`;
        const responseData = {
          statusCode: reply.statusCode,
          payload: JSON.parse(payload),
          headers: reply.getHeaders()
        };
        // Cache successful response for 24 hours
        await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 86400);
      }
    }
    return payload;
  });
};
