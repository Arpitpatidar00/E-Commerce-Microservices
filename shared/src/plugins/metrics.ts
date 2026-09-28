import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import client from 'prom-client';

export interface MetricsPluginOptions {
  appName: string;
}

const metricsPluginAsync: FastifyPluginAsync<MetricsPluginOptions> = async (fastify, options) => {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'app'],
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'app'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 1.5, 2, 5, 10],
    registers: [register],
  });

  fastify.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  fastify.addHook('onRequest', async (request) => {
    (request as any).startTime = process.hrtime();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime;
    if (!startTime) return;
    const duration = process.hrtime(startTime);
    const route = request.routeOptions.config?.url ?? request.routeOptions.url ?? request.url;
    const labels = { method: request.method, route, status_code: String(reply.statusCode), app: options.appName };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration[0] + duration[1] / 1e9);
  });
};

export const metricsPlugin: any = fp(metricsPluginAsync, {
  name: 'metrics-plugin'
});
