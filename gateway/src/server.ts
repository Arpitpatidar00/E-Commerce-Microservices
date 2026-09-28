import fastify from "fastify";
import proxy from "@fastify/http-proxy";
import dotenv from "dotenv";
import rateLimit from "@fastify/rate-limit";
import { metricsPlugin } from "@ecommerce/shared";

dotenv.config();

const app = fastify({ logger: true });

app.register(rateLimit, {
  max: 1000,
  timeWindow: "1 minute",
});

app.register(metricsPlugin, { appName: "gateway" });

import { JwtService } from "@ecommerce/shared";

const PUBLIC_PATHS = new Set([
  "/health",
  "/metrics",
  "/api/users/auth/register",
  "/api/users/auth/login",
]);

app.addHook("preHandler", async (request, reply) => {
  if (PUBLIC_PATHS.has(request.url.split("?")[0])) return;

  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ success: false, message: "Missing bearer token" });
  }
  try {
    (request as any).user = JwtService.verify(auth.split(" ")[1]);
  } catch {
    return reply.status(401).send({ success: false, message: "Invalid or expired token" });
  }
});

// Route to User Service
app.register(proxy, {
  upstream: process.env.USER_SERVICE_URL || "http://localhost:3001",
  prefix: "/api/users",
  rewritePrefix: "/api/users",
});

// Route to Product Service
app.register(proxy, {
  upstream: process.env.PRODUCT_SERVICE_URL || "http://localhost:3002",
  prefix: "/api/products",
  rewritePrefix: "/api/products",
});

// Route to Order Service
app.register(proxy, {
  upstream: process.env.ORDER_SERVICE_URL || "http://localhost:3003",
  prefix: "/api/orders",
  rewritePrefix: "/api/orders",
});

// Route to Inventory Service
app.register(proxy, {
  upstream: process.env.INVENTORY_SERVICE_URL || "http://localhost:3004",
  prefix: "/api/inventory",
  rewritePrefix: "/api/inventory",
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
