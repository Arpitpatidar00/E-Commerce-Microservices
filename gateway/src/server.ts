import fastify from "fastify";
import proxy from "@fastify/http-proxy";
import dotenv from "dotenv";
import rateLimit from "@fastify/rate-limit";
import { metricsPlugin } from "@ecommerce/shared";

dotenv.config();

const app = fastify({ logger: true });

// @ts-ignore
app.register(rateLimit, {
  max: 10000000, // Massively increased for peak load testing
  timeWindow: "1 minute",
});

// @ts-ignore
app.register(metricsPlugin, { appName: "gateway" });

// Route to User Service
// @ts-ignore
app.register(proxy, {
  upstream: process.env.USER_SERVICE_URL || "http://localhost:3001",
  prefix: "/api/users",
  rewritePrefix: "/api/users",
});

// Route to Product Service
// @ts-ignore
app.register(proxy, {
  upstream: process.env.PRODUCT_SERVICE_URL || "http://localhost:3002",
  prefix: "/api/products",
  rewritePrefix: "/api/products",
});

// Route to Order Service
// @ts-ignore
app.register(proxy, {
  upstream: process.env.ORDER_SERVICE_URL || "http://localhost:3003",
  prefix: "/api/orders",
  rewritePrefix: "/api/orders",
});

app.get("/health", async (request, reply) => {
  return { status: "ok", service: "gateway" };
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`API Gateway listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
