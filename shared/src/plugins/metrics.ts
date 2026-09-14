import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import client from 'prom-client';

export interface MetricsPluginOptions {
  appName: string;
}

// Initialize default metrics collection once globally
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Define custom HTTP metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 1.5, 2, 5, 10], // Define realistic buckets
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'app'],
  registers: [register]
});

const metricsPluginAsync: FastifyPluginAsync<MetricsPluginOptions> = async (fastify, options) => {
  const { appName } = options;

  // Add a route to expose metrics
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Track request start time
  fastify.addHook('onRequest', async (request, reply) => {
    (request as any).startTime = process.hrtime();
  });

  // Record metrics on response
  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime;
    if (!startTime) return;

    const hrDuration = process.hrtime(startTime);
    const durationSeconds = hrDuration[0] + hrDuration[1] / 1e9;

    // Use a fallback for the route to avoid high cardinality issues (e.g. 404s missing route config)
    const route = request.routeOptions.config.url || request.routerPath || request.url;

    const labels = {
      method: request.method,
      route,
      status_code: reply.statusCode.toString(),
      app: appName
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationMicroseconds.observe(labels, durationSeconds);
  });
};

// @ts-ignore
export const metricsPlugin: any = fp(metricsPluginAsync, {
  name: 'metrics-plugin'
});
