import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idempotencyMiddleware } from '../idempotency';
import Fastify from 'fastify';

// Create a minimal mock for ioredis
const redisMock = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => redisMock)
  };
});

describe('idempotencyMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip non-idempotent methods', async () => {
    const fastify = Fastify();
    idempotencyMiddleware(fastify, 'test-service');

    fastify.get('/test', { config: { idempotency: true } }, async () => {
      return { success: true };
    });

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(200);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('should reject requests missing idempotency key for opted-in routes', async () => {
    const fastify = Fastify();
    idempotencyMiddleware(fastify, 'test-service');

    fastify.post('/test', { config: { idempotency: true } }, async () => {
      return { success: true };
    });

    const response = await fastify.inject({ method: 'POST', url: '/test' });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toEqual({ error: 'Idempotency-Key header is required' });
  });
});
