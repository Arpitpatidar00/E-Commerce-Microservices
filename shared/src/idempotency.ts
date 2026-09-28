import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const RESPONSE_TTL_SECONDS = 86400;   // replay window: 24h
const IN_PROGRESS_TTL_SECONDS = 30;   // tombstone expiry

export const idempotencyMiddleware = (app: FastifyInstance, serviceName: string) => {
  const cacheKeyFor = (request: FastifyRequest) =>
    `idempotency:${serviceName}:${request.method}:${request.url}:${request.headers['idempotency-key']}`;

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Opt-in: only routes declaring `config: { idempotency: true }` are guarded.
    if (!IDEMPOTENT_METHODS.has(request.method)) return;
    if (!(request.routeOptions.config as any)?.idempotency) return;

    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length === 0) {
      return reply.status(400).send({ error: 'Idempotency-Key header is required' });
    }

    const cacheKey = cacheKeyFor(request);
    const cached = await redis.get(cacheKey);

    if (cached && cached !== 'IN_PROGRESS') {
      const { statusCode, payload, headers } = JSON.parse(cached);
      return reply.status(statusCode).headers(headers).send(payload); // replay
    }

    // Acquire the slot; if someone else holds it, it's a concurrent duplicate.
    const acquired = await redis.set(cacheKey, 'IN_PROGRESS', 'EX', IN_PROGRESS_TTL_SECONDS, 'NX');
    if (!acquired) {
      return reply.status(409).send({ error: 'Request is already being processed' });
    }

    (request as any).idempotencyCacheKey = cacheKey;
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const cacheKey = (request as any).idempotencyCacheKey;
    if (!cacheKey) return payload;

    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      try {
        // Strip headers Fastify recomputes anyway; never crash on non-JSON bodies.
        const { 'content-length': _cl, 'content-type': _ct, ...headers } = reply.getHeaders();
        const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
        await redis.set(cacheKey, JSON.stringify({ statusCode: reply.statusCode, payload: body, headers }), 'EX', RESPONSE_TTL_SECONDS);
      } catch {
        // Non-JSON body — skip caching rather than failing the request.
      }
    } else {
      // Release the tombstone so the client can retry a failed request.
      await redis.del(cacheKey);
    }
    return payload;
  });
};
