# Architecture Audit — Fix Report

**Project:** E-Commerce-Microservices
**Date:** 2026-09-15
**Scope reviewed:** `shared/`, `gateway/`, all four services (`user`, `product`, `order`, `inventory`), `deploy/`, `performance/`, CI workflows.

## Scorecard (audit result)

| Dimension | Score | Summary |
|---|---|---|
| Reusability | 7/10 | Real DRY shared core (`buildCoreApp`, errors, validation, auth); some duplication and inconsistencies remain |
| Scalability | 6/10 | Stateless services, caching, circuit breaker — right ideas; no event backbone, sync fan-out, blocking Redis ops |
| Efficiency | 6/10 | Cache-aside + stampede protection is above average; N+1 price fetch, `KEYS` invalidation, shallow health checks |
| Architecture correctness | 5/10 | Correct skeleton, but the core business flow (order → inventory) is incomplete and one middleware breaks all writes |
| **Overall** | **5.5/10** | Patterns are showcased; several are half-wired |

**Strengths worth keeping as-is:** shared `buildCoreApp`/`startServer`, clean controller→service→repository layering in every service, axios-retry + opossum circuit breaker on the order path, atomic conditional `reserveStock` (`$inc` with `$gte` guard), transactional outbox write inside a Drizzle transaction, product-service TTL cache with in-flight coalescing, Prometheus metrics, correlation IDs, graceful shutdown, pnpm workspace, healthchecks in compose.

---

## Severity legend

| Severity | Meaning |
|---|---|
| **P0** | Broken or insecure today — blocks correct use of the system |
| **P1** | Significant correctness/efficiency/testability gap |
| **P2** | Production-readiness hardening |
| **P3** | Polish / nice-to-have |

Each fix lists: **Problem → Fix (with code) → Verify**.

---

# P0 — Critical fixes

## F1. Idempotency middleware breaks every write in the system

**Files:** `shared/src/idempotency.ts`, `shared/src/core/buildCoreApp.ts`

**Problem (4 bugs in one file):**

1. Registered globally in `buildCoreApp` for **all** `POST/PUT/PATCH` and returns `400` when the `Idempotency-Key` header is missing. Login, register, product creation, order creation — all fail unless the client sends a header no client sends.
2. A failed request leaves the `IN_PROGRESS` tombstone in Redis for 10 s (the `onSend` hook only caches 2xx responses), so a legitimate client retry within that window gets `409 Request is already being processed`.
3. `JSON.parse(payload)` in `onSend` throws on any non-JSON body (e.g. 204, plain text), turning a successful request into a 500.
4. The Redis key `idempotency:${key}` has no service or route scope — the same idempotency key sent to product-service and order-service collides.

**Fix:** make idempotency **opt-in per route** via Fastify route `config`, scope the key, release the tombstone on failure, and only cache JSON bodies.

Replace `shared/src/idempotency.ts`:

```ts
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
```

Update `shared/src/core/buildCoreApp.ts` (pass the service name so keys are scoped):

```ts
idempotencyMiddleware(app, serviceName);
```

Add type support for the route flag (e.g. in `shared/src/types/common.types.ts`):

```ts
declare module 'fastify' {
  interface FastifyContextConfig {
    idempotency?: boolean;
  }
}
```

Then opt in on the one route that truly needs it — `services/order-service/src/routes/order.ts`:

```ts
fastify.post('/', {
  config: { idempotency: true },
  preHandler: validateRequest({ body: createOrderRequestSchema }) as any
}, orderController.createOrder);
```

> The gateway proxies all headers, so `Idempotency-Key` flows through unchanged.

**Verify:** `POST /api/users/auth/login` without the header → succeeds (was 400). `POST /api/orders` with `Idempotency-Key: test-1` twice → identical response both times; force an error inside create → immediate retry is not 409.

---

## F2. The distributed flow doesn't exist: outbox has no relay, orders never reserve inventory

**Files:** `services/order-service/src/repositories/orderRepository.ts` (outbox write exists), new files in order-service and inventory-service, `services/order-service/src/db/schema.ts` (already has `status` column)

**Problem:** `createOrderWithOutbox` writes `OrderCreated` events into `outbox_events` — and nothing ever reads them. There is no relay, no broker, no consumer. Meanwhile `inventory-service` has a perfectly good atomic `reserveStock` that **nothing calls**. Net effect today: you can order 100 units of an out-of-stock product, and events pile up in the table forever.

**Fix:** complete the saga using **Redis Streams** (Redis is already in your stack — no new infra; swap for Kafka/RabbitMQ later if you want):

```
order-service                     inventory-service                order-service
┌────────────┐   relay (poll)    ┌──────────────────┐   result    ┌────────────────┐
│ order tx + │ ────────────────► │ reserveStock per │───────────► │ update order   │
│ outbox row │   XADD            │ item; XADD result│   XADD      │ status         │
└────────────┘  orders:events    └──────────────────┘ inventory:  └────────────────┘
                                                  events
```

Status flow: `CREATED → CONFIRMED` (all items reserved) or `CREATED → REJECTED` (insufficient stock).

### 2a. Outbox relay (order-service) — `services/order-service/src/workers/outboxRelay.ts`

```ts
import { db } from '../db';
import { outboxEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');
const STREAM = 'orders:events';
const BATCH_SIZE = 50;

export const startOutboxRelay = async () => {
  for (;;) {
    const events = await db.transaction(async (tx) =>
      tx.select().from(outboxEvents)
        .where(eq(outboxEvents.status, 'PENDING'))
        .orderBy(outboxEvents.id)
        .limit(BATCH_SIZE)
        .for('update', { skipLocked: true })   // safe if you ever run 2 relays
    );

    for (const event of events) {
      await redis.xadd(STREAM, '*',
        'eventType', event.eventType,
        'payload', JSON.stringify(event.payload),
      );
      await db.update(outboxEvents)
        .set({ status: 'PUBLISHED' })
        .where(eq(outboxEvents.id, event.id));
    }

    await new Promise((r) => setTimeout(r, events.length === BATCH_SIZE ? 0 : 1000));
  }
};
```

Start it in `services/order-service/src/server.ts` (fire-and-forget with error logging):

```ts
import { startOutboxRelay } from './workers/outboxRelay';

startOutboxRelay().catch((err) => {
  console.error('Outbox relay crashed', err);
  process.exit(1);
});
```

### 2b. Inventory consumer — `services/inventory-service/src/consumers/orderEventsConsumer.ts`

```ts
import Redis from 'ioredis';
import { inventoryService } from '../services/inventoryService';

const redis = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');
const IN_STREAM = 'orders:events';
const OUT_STREAM = 'inventory:events';
const GROUP = 'inventory-service';
const CONSUMER = `inventory-${process.env.HOSTNAME ?? 'local'}`;

export const startOrderEventsConsumer = async () => {
  try { await redis.xgroup('CREATE', IN_STREAM, GROUP, '0', 'MKSTREAM'); }
  catch { /* BUSYGROUP — group already exists */ }

  for (;;) {
    const batches = await redis.xreadgroup(
      'GROUP', GROUP, CONSUMER, 'COUNT', 10, 'BLOCK', 5000,
      'STREAMS', IN_STREAM, '>',
    );
    if (!batches) continue;

    for (const [, messages] of batches) {
      for (const [id, fields] of messages) {
        const map = new Map(fields as string[]);
        if (map.get('eventType') !== 'OrderCreated') { await redis.xack(IN_STREAM, GROUP, id); continue; }

        const event = JSON.parse(map.get('payload')!);
        try {
          for (const item of event.items) {
            await inventoryService.reserveStock(item.productId, item.quantity);
          }
          await redis.xadd(OUT_STREAM, '*',
            'eventType', 'InventoryReserved',
            'payload', JSON.stringify({ orderId: event.orderId }),
          );
        } catch (err) {
          await redis.xadd(OUT_STREAM, '*',
            'eventType', 'InventoryRejected',
            'payload', JSON.stringify({ orderId: event.orderId, reason: (err as Error).message }),
          );
        }
        await redis.xack(IN_STREAM, GROUP, id);
      }
    }
  }
};
```

### 2c. Order status updater — `services/order-service/src/consumers/inventoryEventsConsumer.ts`

```ts
import Redis from 'ioredis';
import { db } from '../db';
import { orders } from '../db/schema';
import { eq } from 'drizzle-orm';

const redis = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');
const STREAM = 'inventory:events';
const GROUP = 'order-service';

export const startInventoryEventsConsumer = async () => {
  try { await redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM'); }
  catch { /* BUSYGROUP */ }

  for (;;) {
    const batches = await redis.xreadgroup('GROUP', GROUP, 'order-consumer', 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', STREAM, '>');
    if (!batches) continue;

    for (const [, messages] of batches) {
      for (const [id, fields] of messages) {
        const map = new Map(fields as string[]);
        const event = JSON.parse(map.get('payload')!);
        const status = map.get('eventType') === 'InventoryReserved' ? 'CONFIRMED' : 'REJECTED';
        await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, event.orderId));
        await redis.xack(STREAM, GROUP, id);
      }
    }
  }
};
```

**Design notes:**
- If the relay crashes between `xadd` and the status update, the event is republished → **consumers must be idempotent**. Cheapest guard in inventory: `await redis.set(\`inv:processed:${event.orderId}\`, '1', 'EX', 86400, 'NX')` and skip if it already existed.
- Add a "REJECTED" refund path later (compensation) when you add payments — that's the full saga.
- Purge published rows periodically (cron or on relay): `DELETE FROM outbox_events WHERE status = 'PUBLISHED' AND created_at < now() - interval '7 days'`.

**Verify:** set stock for a product via inventory → create order for quantity within stock → order status becomes `CONFIRMED` within ~1–2 s; order 99999 units → status becomes `REJECTED` and `availableStock` is unchanged.

---

## F3. No authentication on anything that matters

**Files:** `gateway/src/server.ts`, `shared/src/services/jwt.service.ts`, service route files

**Problem:** You sign JWTs at login and `authMiddleware` exists — but it is used on exactly **one** endpoint (`/api/users/auth/me`). Product creation, order creation, and inventory writes are fully open through the gateway. Also `JWT_SECRET || 'supersecret'` means a missing env var silently ships a known secret.

**Fix (3 parts):**

### 3a. Verify JWTs at the gateway (edge authentication)

Add to `gateway/src/server.ts` **before** the proxy registrations:

```ts
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
```

Downstream, derive identity from the token, **never from the request body**: in `order-service`'s controller, replace the client-supplied `userId` with `(request as any).user.id` (and remove `userId` from `createOrderRequestSchema` so clients can't spoof it). Add a second defense layer by using `authMiddleware` on the write routes of product/inventory services (see 3b) — edge auth for UX, service auth for safety.

### 3b. Protect write routes in services

```ts
// services/product-service/src/routes/product.ts
import { validateRequest, authMiddleware } from '@ecommerce/shared';

fastify.post('/', {
  preHandler: [authMiddleware as any, validateRequest({ body: createProductRequestSchema }) as any]
}, productController.createProduct);
```

Same pattern for `inventory-service` `POST` routes and `order-service` routes.

### 3c. Fail fast on missing JWT secret — `shared/src/services/jwt.service.ts`

```ts
export class JwtService {
  private static getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET is missing or too weak (min 32 chars)');
    }
    return secret;
  }

  static sign(payload: string | object | Buffer): string {
    return jwt.sign(payload, this.getSecret(), { expiresIn: '24h' });
  }

  static verify(token: string): any {
    return jwt.verify(token, this.getSecret());
  }
}
```

Set a strong `JWT_SECRET` in `deploy/docker-compose.deploy.yml` (same value for gateway + user-service) — use `openssl rand -base64 48`.

**Verify:** `POST /api/orders` without a token → 401 at the gateway; with the login token → 201. Start any service without `JWT_SECRET` → crashes immediately with a clear message.

---

## F4. Inventory-service is unreachable through the gateway

**File:** `gateway/src/server.ts`

**Problem:** The gateway proxies users, products, and orders — inventory is missing, so in the deployed topology it can only be reached from inside the Docker network.

**Fix:**

```ts
// Route to Inventory Service
app.register(proxy, {
  upstream: process.env.INVENTORY_SERVICE_URL || "http://localhost:3004",
  prefix: "/api/inventory",
  rewritePrefix: "/api/inventory",
});
```

(Add `INVENTORY_SERVICE_URL` to compose env, matching the other services.) Note: after F3, inventory reads are authed; keep `POST /api/inventory/*` (stock admin) further restricted — see F12.

---

# P1 — Significant fixes

## F5. Error handling bypasses your own AppError design

**Files:** `services/order-service/src/services/orderService.ts`, `services/order-service/src/controllers/order.ts`, `services/product-service/src/services/productService.ts`, `services/inventory-service/src/services/inventoryService.ts`, `shared/src/errors/AppError.ts`

**Problem:** Services throw raw `Error('Order not found')`, and controllers classify them by **string matching** (`error.message.startsWith('Failed to fetch price')`). The global handler maps unknown errors to 500 — so "not found" currently returns 500, and one renamed message string silently breaks status codes.

**Fix:** add an upstream-failure error, throw typed errors from services, delete string matching from controllers.

```ts
// shared/src/errors/AppError.ts — add:
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503);
  }
}
```

```ts
// orderService.ts — replace throws:
import { NotFoundError, ServiceUnavailableError } from '@ecommerce/shared';

// inside the fetch loop's catch:
throw new ServiceUnavailableError(`Price lookup failed for product ${item.productId}`);

// getOrderById:
if (!order) throw new NotFoundError('Order not found');
```

```ts
// controllers/order.ts — becomes:
export const createOrder = async (req: FastifyRequest, reply: FastifyReply) => {
  const order = await orderService.createOrder(req.body as CreateOrderRequest);
  return ApiResponse.sendSuccess(reply, order, 'Order created successfully', HttpStatus.CREATED);
};

export const getOrderById = async (req: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => {
  const order = await orderService.getOrderById(req.params.id);
  return ApiResponse.sendSuccess(reply, order, 'Order fetched successfully', HttpStatus.OK);
};
```

Do the same in product (`throw new NotFoundError('Product not found')` in `getProductById`) and inventory (`Insufficient stock...` → `new ConflictError(...)` / `NotFoundError`).

**Verify:** `GET /api/orders/999999` → 404 (was 500). Stop product-service, create an order → 503 (was 500).

## F6. Metrics singleton blocks testing

**File:** `shared/src/plugins/metrics.ts`

**Problem:** Registry + Histogram + Counter are created at module scope. Calling `buildCoreApp` twice in one process (i.e., any integration test that builds two app instances) throws `A metric with the name http_request_duration_seconds has already been registered`.

**Fix:** move all metric state inside the plugin so each app instance owns its own registry:

```ts
export const metricsPluginAsync: FastifyPluginAsync<MetricsPluginOptions> = async (fastify, options) => {
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
```

(One app per process in production, so per-instance metrics are equivalent; tests can now build many apps.)

**Verify:** `pnpm build` unchanged; a test that calls `buildCoreApp` twice passes.

## F7. Zero tests; CI only compiles

**Files:** new test files, `.github/workflows/ci.yml`, root `package.json`

**Problem:** No `*.test.ts` anywhere; CI runs `build` only — not even the `lint` script that exists.

**Fix:**

1. Add `vitest` + `mongodb-memory-server` + `ioredis-mock` as dev deps.
2. First three tests, highest value per line of code:
   - **inventory reservation** (in-memory Mongo): reserve below stock → OK; reserve above stock → rejected; parallel reservations never oversell.
   - **idempotency hook** (ioredis-mock + `app.inject()`): first POST replays identical response on retry; failed request doesn't poison the key.
   - **auth middleware**: no token → 401, garbage token → 401, valid token → `request.user` set.
3. Root scripts:

```json
"test": "pnpm -r --parallel test run"
```

4. CI additions (after the build step):

```yaml
- name: Lint
  run: pnpm run lint
- name: Test
  run: pnpm run test
```

**Verify:** CI goes red on a regression like removing the `$gte` stock guard.

## F8. N+1 sequential price fetch in `createOrder`

**File:** `services/order-service/src/services/orderService.ts`

**Problem:** One HTTP round-trip per item, sequential — a 5-item order costs 5× latency and amplifies load on product-service.

**Fix:** dedupe and parallelize (the circuit breaker makes this safe):

```ts
async createOrder(data: CreateOrderRequest): Promise<Order> {
  const uniqueIds = [...new Set(data.items.map((i) => i.productId))];

  const products = new Map(
    await Promise.all(
      uniqueIds.map(async (id) => {
        const product = await breaker.fire(id, this.productServiceUrl) as any;
        return [id, product] as const;
      })
    )
  );

  let totalAmount = 0;
  const itemsWithPrices = data.items.map((item) => {
    const product = products.get(item.productId);
    if (!product?.price) {
      throw new ServiceUnavailableError(`Price lookup failed for product ${item.productId}`);
    }
    totalAmount += product.price * item.quantity;
    return { productId: item.productId, quantity: item.quantity, price: product.price.toString() };
  });
  // ... unchanged outbox insert
}
```

(For large carts, the better fix is a batch endpoint — see F15.)

## F9. Blocking `KEYS` for cache invalidation

**File:** `services/product-service/src/services/productService.ts` (end of `createProduct`)

**Problem:** `redisClient.keys('products:page:*')` is O(N) over the whole keyspace and blocks Redis's event loop while scanning.

**Fix:** incremental scan + non-blocking delete:

```ts
import { Readable } from 'stream';

const invalidateProductCaches = async (redisClient: Redis) => {
  for await (const key of redisClient.scanIterator({ MATCH: 'products:page:*', COUNT: 100 })) {
    await redisClient.unlink(key);   // UNLINK frees memory async, unlike DEL
  }
};
```

(ioredis ≥5 provides `scanIterator`; if yours doesn't, use `scanStream`.) Also invalidate `product:${id}` for updated products once you add an update endpoint — today nothing invalidates it.

## F10. Graceful shutdown doesn't actually close anything

**Files:** `services/order-service/src/server.ts` (cleanup is `console.log`), other services' `server.ts`, `services/order-service/src/db/index.ts`

**Problem:** `startServer` supports cleanup tasks, but the one registered task just logs. DB pools and Redis sockets die abruptly on SIGTERM — in-flight work and connections are dropped on every deploy.

**Fix:** export the pool, then register real tasks:

```ts
// db/index.ts — add at the end:
export { pool };

// order-service server.ts:
import { pool } from './db';
import Redis from 'ioredis';

await startServer(app, port, 'Order Service', [
  async () => { await pool.end(); },
  async () => { await redis.quit(); },   // reuse the relay/consumer client instances
]);
```

For Mongo services: `await mongoose.connection.close()` plus `redis.quit()` (export the client from `config/db.ts`).

---

# P2 — Production-readiness hardening

## F11. Shallow health checks

**Files:** `shared/src/core/buildCoreApp.ts`, each service's `server.ts`

**Problem:** `/health` always returns ok even when the DB is down — orchestrators will route traffic to a dead instance.

**Fix:** accept a readiness probe and expose `/ready`:

```ts
// buildCoreApp
export const buildCoreApp = (
  serviceName: string,
  opts: { readiness?: () => Promise<boolean> } = {}
): FastifyInstance => {
  // ...existing setup...
  app.get('/health', async () => ({ status: 'ok', service: serviceName }));
  app.get('/ready', async (_req, reply) => {
    if (!opts.readiness) return { status: 'ready' };
    try {
      if (!(await opts.readiness())) throw new Error('dependency not ready');
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
};
```

```ts
// order-service:
buildApp({
  readiness: async () => {
    await pool.query('SELECT 1');
    return true;
  },
});
```

Mongo services: `mongoose.connection.readyState === 1`. Keep `/health` shallow (liveness — restart me if even this fails) and `/ready` deep (routing gate). Point compose healthchecks at `/ready`.

## F12. Gateway hardening

**File:** `gateway/src/server.ts`, `deploy/nginx`

**Problem:** No security headers, no upstream timeouts (a hung service hangs the gateway), 1000 req/min is generous for auth endpoints, and inventory admin writes are only IP-trusted.

**Fix:**

```bash
pnpm add @fastify/helmet --filter gateway
```

```ts
import helmet from "@fastify/helmet";

app.register(helmet);   // security headers
app.register(rateLimit, { max: 300, timeWindow: "1 minute" }); // tighten global
```

Bound upstream failures so a slow service can't pin gateway sockets:

```ts
app.register(proxy, {
  upstream: process.env.USER_SERVICE_URL || "http://localhost:3001",
  prefix: "/api/users",
  rewritePrefix: "/api/users",
  undici: {
    connections: 64,
    pipelining: 10,
    keepAliveTimeout: 60_000,
    headersTimeout: 5_000,   // fail fast on hung upstreams
    bodyTimeout: 10_000,
  },
});
```

Add nginx `limit_req` (a stricter zone for `/api/users/auth/*`) in `deploy/nginx` as the brute-force guard for login/register.

## F13. API versioning

**Files:** `gateway/src/server.ts`, all service route prefixes

**Fix (cheapest correct path — version at the edge only):**

```ts
app.register(proxy, {
  upstream: process.env.USER_SERVICE_URL || "http://localhost:3001",
  prefix: "/api/v1/users",
  rewritePrefix: "/api/users",   // services stay unchanged
});
```

Later, when you need a breaking v2, services add the real `/api/v2` routes and the gateway stops rewriting for them.

## F14. Centralize shared clients; fix config duplication

**Files:** `shared/src/idempotency.ts` (opens its own Redis), `services/product-service/src/config/db.ts` (exports `redisClient` — a Redis client in a file named `db.ts`)

**Fix:** add `shared/src/database/redis.ts`:

```ts
import Redis from 'ioredis';

let client: Redis | null = null;

export const getRedisClient = (): Redis => {
  client ??= new Redis(process.env.REDIS_URI || 'redis://localhost:6379');
  return client;
};
```

Use it from `idempotency.ts`, product-service, and the new consumers — one connection per process, one place to add retry/reconnect policy. (`mongoose` helper already lives in `shared/src/database/mongo.ts`; keep DB-specific pools per service — that part is correct.)

## F15. Batch price endpoint for carts

**Files:** `services/product-service` (route + repo), `order-service` `orderService.ts`

**Fix:**

```ts
// product-service routes:
fastify.post('/prices', {
  preHandler: validateRequest({ body: priceLookupRequestSchema }) as any
}, productController.getPrices);

// repository:
findManyByIds(ids: string[]) {
  return Product.find({ _id: { $in: ids } });
}
```

Order-service sends `{ ids: [...] }` once per order instead of N requests. Keep F8's parallel fallback for single items.

## F16. Mongo indexes

**Files:** `services/inventory-service/src/models/Inventory.ts`, `services/product-service/src/models/Product.ts`

**Problem:** Every inventory lookup filters by `productId` with no guaranteed index; the same `productId` can be inserted twice via `setStock` upsert races on collections without a unique index.

**Fix:**

```ts
// Inventory schema:
InventorySchema.index({ productId: 1 }, { unique: true });

// Product schema (once you add search):
ProductSchema.index({ name: 'text', description: 'text' });
```

(User-service already has `unique: true` on email — keep it.)

---

# P3 — Polish

| # | Item | Where | Fix |
|---|---|---|---|
| P3-1 | `bcrypt.genSalt` + `bcrypt.hash` are two steps for one job | `user-service/src/services/userService.ts` | `await bcrypt.hash(data.password, 10)` |
| P3-2 | Correlation-ID logger swap works, but Fastify's native way is `genReqId` + `includeChildLoggers` | `shared/src/middleware.ts` | `fastify({ genReqId: (req) => req.headers['x-correlation-id'] ?? randomUUID() })` |
| P3-3 | `dotenv.config()` scattered in entry files | all `server.ts` | one `shared/src/config/env.ts` that loads and validates env (zod schema, fail-fast) — pairs with F3c |
| P3-4 | Order→product contract is implicit (`response.data.data`) | `order-service` | move `ApiResponse` + shared DTO types into the shared package and import them in both services |
| P3-5 | No order list endpoint | `order-service` | `GET /api/orders` with cursor pagination (`PaginatedResult<T>` already exists in shared) |
| P3-6 | `products:page:*` cache invalidation misses `product:{id}` on future updates | product-service | covered in F9 — invalidate both key families |
| P3-7 | Replay of cached idempotent responses sends stored headers verbatim | `shared/src/idempotency.ts` | covered in F1 (strip `content-length`/`content-type`) |

---

# Recommended implementation order

Four phases, each independently shippable:

## Phase 1 — Stop the bleeding (~1 day)
- [ ] F1 idempotency rewrite (opt-in, scoped keys, tombstone release)
- [ ] F4 gateway inventory proxy
- [ ] F3c JWT secret fail-fast
- [ ] F5 typed errors end-to-end
- **Outcome:** every existing endpoint behaves correctly; right status codes.

## Phase 2 — Complete the architecture (~2–3 days)
- [ ] F3a/3b gateway edge auth + service route protection
- [ ] F2 outbox relay + inventory consumer + order status updater (the saga)
- [ ] F10 real shutdown cleanup
- **Outcome:** the system finally does the thing it's shaped like: order → stock reserved → order confirmed/rejected.

## Phase 3 — Testability & CI (~2 days)
- [ ] F6 metrics per-instance registry
- [ ] F7 vitest + first three suites + CI lint/test steps
- **Outcome:** refactoring stops being scary.

## Phase 4 — Hardening & polish (~2–3 days)
- [ ] F8 parallel price fetch, F9 SCAN invalidation, F11 readiness probes
- [ ] F12 helmet/timeouts/limits, F13 versioning, F14 shared Redis client
- [ ] F15 batch prices, F16 indexes, P3 items
- **Outcome:** 7.5–8/10 territory — this stops being a demo and becomes a defensible reference architecture.

---

# End-to-end verification script (after Phases 1–2)

```bash
# 1. Register + login
TOKEN=$(curl -s -X POST localhost:3000/api/v1/users/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Arpit","email":"arpit@test.com","password":"Passw0rd!123"}' | jq -r .data.id)
# (then login → grab JWT)

# 2. Stock the warehouse (admin token)
curl -X POST localhost:3000/api/v1/inventory/prod-1 \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"availableStock": 10}'

# 3. Create a product
curl -X POST localhost:3000/api/v1/products \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"Keyboard","description":"Mech","price":99.99,"stock":0}'

# 4. Order it — note the Idempotency-Key
curl -X POST localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f3c1a2e-4444-4f6a-9c9f-1e2b3c4d5e6f' \
  -d '{"items":[{"productId":"<prod-id>","quantity":2}]}'

# 5. Replay with the SAME key → byte-identical response, no second order row
# 6. Wait ~2s → GET /api/v1/orders/:id → status: "CONFIRMED", inventory availableStock: 8
# 7. Order 99 units → status: "REJECTED", inventory unchanged
```

If all seven steps pass, the audit's P0/P1 items are closed.
