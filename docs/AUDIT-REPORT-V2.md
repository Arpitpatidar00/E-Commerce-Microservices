# Architecture Audit V2 — Re-review

**Project:** E-Commerce-Microservices
**Date:** 2026-09-15
**Baseline:** V1 audit (`docs/AUDIT-FIX-REPORT.md`), overall 5.5/10
**What changed since V1:** nearly every file in `shared/`, `gateway/`, and the services was modified; new `workers/` and `consumers/` directories; 3 test suites; zod env config; CI now lints and tests.

## Scorecard

| Dimension | V1 | V2 | Δ | Why |
|---|---|---|---|---|
| Reusability | 7 | 7.5 | +0.5 | Richer shared core (env config, redis factory, typed errors, route config typing) — but the redis factory is **unused** and event contracts are still duplicated strings |
| Scalability | 6 | 7.5 | +1.5 | Real async backbone now exists (outbox → streams → saga), parallel price fetch, unique indexes. Missing PEL recovery and outbox purge |
| Efficiency | 6 | 7 | +1 | Edge auth, parallel fetch, per-instance metrics. Still blocking `KEYS`, cache lock-poll regression, no batch prices |
| Architecture correctness | 5 | 7 | +2 | The system now actually does what it's shaped like: auth enforced, typed errors, working saga happy-path. Saga edge cases (crash, partial failure) and a red test suite hold it back |
| **Overall** | **5.5** | **7** | **+1.5** | Phase 1 + Phase 2 of the fix report landed. Remaining gap is failure-path hardening and making CI green |

**Verified this run:** `pnpm run build` ✅ all 6 packages. `pnpm run test` ❌ **1 of 3 source suites fails + vitest picks up stale `dist/` test copies — CI as configured is red** (details in N6).

## Fix-report scorecard (V1 → now)

| Fix | Status | Notes |
|---|---|---|
| F1 idempotency rewrite | ✅ applied | Opt-in per route, scoped keys, tombstone released on failure, headers stripped |
| F2 order→inventory saga | ✅ applied | Relay + both consumers + CONFIRMED/REJECTED. Edge cases remain (N1–N3) |
| F3 auth | ✅ applied | Edge auth + public paths, service-level `authMiddleware`, `userId` from token, JWT fail-fast, zod env schema |
| F4 inventory gateway route | ✅ applied | |
| F5 typed errors | ✅ applied | `ServiceUnavailableError` added, controllers clean, `NotFoundError`/`ConflictError` in services |
| F6 metrics per-instance | ✅ applied | Registry + metrics inside the plugin |
| F7 tests + CI | ⚠️ partial | 3 suites exist, CI runs them — but the suite is red as configured (N6) |
| F8 parallel price fetch | ✅ applied | No dedupe of duplicate `productId`s (trivial) |
| F9 SCAN invalidation | ❌ not applied | `createProduct` still uses blocking `redisClient.keys('products:page:*')` |
| F10 shutdown cleanup | ⚠️ partial | `pool.end()` / `mongoose.close()` yes; relay/consumer Redis clients never closed |
| F11 readiness probes | ❌ not applied | `/health` only, no `/ready` |
| F12 gateway hardening | ❌ not applied | No helmet, still 1000 req/min global, no upstream timeouts |
| F13 API versioning | ❌ not applied | |
| F14 shared redis client | ⚠️ partial | `getRedisClient()` exists in shared — **nothing uses it**; every file still does `new Redis(...)` |
| F15 batch price endpoint | ❌ not applied | |
| F16 indexes | ✅ applied | `productId` unique on Inventory; createdAt/price on Product |

---

# New findings (introduced or newly visible this round)

Severity: **P0** broken today · **P1** significant · **P2** hardening · **P3** polish.

## N1 (P1) — No pending-message recovery: a consumer crash strands orders forever

**File:** `services/inventory-service/src/consumers/orderEventsConsumer.ts` (same pattern in `order-service/src/consumers/inventoryEventsConsumer.ts`)

**Problem:** Both consumers read only `'>'` (new messages). If a consumer crashes *after* Redis delivers a message but *before* `XACK`, the message sits in the group's Pending Entries List forever — nothing ever claims it. The order stays `CREATED` permanently, and any already-reserved stock leaks.

**Fix:** add a reclaim loop for abandoned messages (idempotent handling already exists via the marker):

```ts
const claimAbandoned = async () => {
  // Reclaim messages pending > 60s (owner crashed or stuck)
  const [, claimed] = await redis.xautoclaim(IN_STREAM, GROUP, CONSUMER, 60_000, '0');
  for (const [id, fields] of (claimed ?? []) as any) {
    await handleMessage(id, fields);   // extract the per-message body into a function
  }
};

setInterval(() => claimAbandoned().catch(console.error), 30_000);
```

(Redis ≥ 6.2. `handleMessage` must stay idempotent — the `inv:processed` marker covers that, see N3 for its fix.) Also add a periodic `XTRIM`/`XDEL` after ack once streams grow, or cap with `MAXLEN ≈ 10000` on `XADD`.

## N2 (P1) — Partial reservation has no compensation: stock leaks on multi-item failures

**File:** `services/inventory-service/src/consumers/orderEventsConsumer.ts`

**Problem:** Items are reserved one at a time. If item 2 fails (`ConflictError`), item 1's deduction is never rolled back — yet the order is marked `REJECTED`. The available stock for item 1 is permanently reduced with no order holding it.

**Fix:** track what you reserved and release on failure:

```ts
const reserved: { productId: string; quantity: number }[] = [];
try {
  for (const item of event.items) {
    await inventoryService.reserveStock(item.productId, item.quantity);
    reserved.push(item);
  }
  await redis.xadd(OUT_STREAM, '*', 'eventType', 'InventoryReserved',
    'payload', JSON.stringify({ orderId: event.orderId }));
} catch (err) {
  // Compensate: give back what we took before the failure
  await Promise.all(reserved.map(r =>
    inventoryRepository.releaseStock(r.productId, r.quantity)
  ));
  await redis.xadd(OUT_STREAM, '*', 'eventType', 'InventoryRejected',
    'payload', JSON.stringify({ orderId: event.orderId, reason: (err as Error).message }));
}
```

```ts
// inventoryRepository — add:
async releaseStock(productId: string, quantity: number) {
  return Inventory.findOneAndUpdate(
    { productId, reservedStock: { $gte: quantity } },
    { $inc: { availableStock: quantity, reservedStock: -quantity } },
    { new: true }
  );
}
```

## N3 (P1) — Idempotency marker set *before* processing blocks all retries

**File:** `services/inventory-service/src/consumers/orderEventsConsumer.ts`

**Problem:** `redis.set('inv:processed:...', 'NX')` runs before the reservation loop. If processing fails for a *transient* reason (Mongo blip, network), the marker is already set for 24h — redelivery (N1 fix) will skip the order, so it's stuck in `CREATED` for a day.

**Fix:** mark **after** success, and key the reject path separately so a rejected order is final but a crashed one is retryable:

```ts
const marker = `inv:processed:${event.orderId}`;
if (await redis.get(marker)) { await redis.xack(IN_STREAM, GROUP, id); continue; }
// ...reserve (with N2 compensation)...
// on success only:
await redis.set(marker, '1', 'EX', 86400);
```

Between "started" and "marked," a crash + reclaim (N1) causes a re-run — safe, because `reserveStock` is a conditional `$inc` and N2's compensation makes re-runs convergent for the no-stock case; for the crashed-mid-success case the marker write is idempotent anyway.

## N4 (P1 security) — No authorization: any logged-in user is an admin

**Files:** `services/inventory-service/src/routes/inventory.ts`, `services/product-service/src/routes/product.ts`, `shared/src/services/jwt.service.ts`

**Problem:** Authentication landed (good), but every write route only checks *that* you have a token, not *who you are*. Any registered user can set inventory stock and create products via the gateway.

**Fix:** put a role in the token, check it on admin routes:

```ts
// jwt.service.ts — sign roles
static sign(payload: { id: string; email: string; role: string }): string

// user-service login: role comes from the User document (add `role` field, default 'customer')

// shared — add next to authMiddleware:
export const requireRole = (...roles: string[]) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user?.role || !roles.includes(user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };

// inventory/product write routes:
preHandler: [authMiddleware as any, requireRole('admin')]
```

## N5 (P1 — CI is red) — Test suite fails as configured: 3 separate defects

**Verified by running it.** `pnpm run test` → *Test Files 4 failed | 2 passed (6); unhandled ioredis connection error*.

1. **Vitest executes compiled copies in `dist/`** (each service's `tsc` emits `dist/**/__tests__/*.js`, vitest finds them and they can't `require('vitest')`). Add a root `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

   (And add `**/dist` hygiene: either exclude tests from `tsc` via `tsconfig` `"exclude": ["src/**/__tests__"]` or don't compile them.)

2. **The ioredis mock isn't constructible** — `vi.mock('ioredis', () => ({ default: vi.fn(() => redisMock) }))` fails with `() => redisMock is not a constructor` because arrow functions can't be `new`ed. Use a class:

```ts
vi.mock('ioredis', () => ({
  default: class RedisMock {
    get = vi.fn(); set = vi.fn(); del = vi.fn();
  }
}));
```

3. **Real Redis connection attempt during tests** — any test that imports the `@ecommerce/shared` barrel triggers `idempotency.ts`'s module-scope `new Redis(...)` (the `[ioredis] Unhandled error event: AggregateError` in stderr). This is the strongest argument for finishing F14 (N7): module-scope connections are untestable by construction.

**After these:** all 3 source suites pass locally. Then add the two missing high-value suites: order→inventory saga end-to-end (mock the stream with `ioredis-mock`, real in-memory Mongo), and the gateway auth hook (401 / public path / valid token).

## N6 (P2) — Outbox relay: `FOR UPDATE SKIP LOCKED` is decorative

**File:** `services/order-service/src/workers/outboxRelay.ts`

**Problem:** The SELECT runs inside a transaction that commits immediately; the `XADD` and the `PUBLISHED` update happen *after* the lock is released. A second relay replica can select the same rows and double-publish. Nothing breaks today only because the consumer dedupes.

**Fix (choose one):**
- Claim rows atomically *outside* a hanging transaction: `UPDATE outbox_events SET status = 'PROCESSING' WHERE id IN (SELECT id FROM outbox_events WHERE status = 'PENDING' ORDER BY id LIMIT 50 RETURNING *)` — then publish + set `PUBLISHED`.
- Or accept at-least-once and delete the lock clause (it's misleading as written; a comment saying "duplicates possible, consumers must be idempotent" is more honest).

Also add the purge job (still missing): `DELETE FROM outbox_events WHERE status='PUBLISHED' AND created_at < now() - interval '7 days'` on a timer, or the table grows forever.

## N7 (P2) — Redis client factory exists but nothing uses it (F14 unfinished)

**Files:** `shared/src/database/redis.ts` (unused) vs `shared/src/idempotency.ts`, `services/order-service/src/workers/outboxRelay.ts`, `*/consumers/*.ts`, `services/product-service/src/config/db.ts` — each creates its own `new Redis(...)`.

**Impact:** 4–5 connections per process instead of 1; module-scope instantiation makes tests fire real connections (N5.3); no single place for retry/reconnect policy; shutdown can't close them (F10 unfinished).

**Fix:** make the factory lazy (it already is) and use it everywhere, including `idempotency.ts`:

```ts
import { getRedisClient } from './database/redis';
// inside the hook closures:
const redis = getRedisClient();
```

Register `closeRedisConnection` (already exported!) in each service's cleanup tasks.

## N8 (P2) — Cache lock/poll is a regression vs the old stampede coalescing

**File:** `services/product-service/src/services/productService.ts` (`getOrSetCache`)

**Problem:** The previous in-flight `Promise` coalescing was replaced with a Redis lock + poll loop (20 × 100ms) and — worse — a bare `fetchFn()` fallback after 2s, which re-opens the stampede under exactly the contention the lock exists for, while adding up to 2s latency to blocked requests.

**Fix:** revert to per-process promise coalescing (fast, no Redis round-trips) and keep a *short* Redis lock only if you truly expect multi-instance dogpiles:

```ts
private inFlight = new Map<string, Promise<any>>();

private async getOrSetCache<T>(key: string, ttl: number, fetchFn: () => Promise<T>): Promise<T> {
  try {
    const cached = await redisClient.get(key);
    if (cached) return JSON.parse(cached);
  } catch { /* cache is best-effort */ }

  const existing = this.inFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      const result = await fetchFn();
      await redisClient.set(key, JSON.stringify(result), 'EX', ttl).catch(() => {});
      return result;
    } finally {
      this.inFlight.delete(key);
    }
  })();

  this.inFlight.set(key, p);
  return p;
}
```

## N9 (P3) — Small items

| Item | Where | Fix |
|---|---|---|
| Duplicate `productId`s in one order fetch the price twice (no dedupe before `Promise.all`) | `orderService.ts` | `[...new Set(items.map(i => i.productId))]`, then map quantities |
| `orderIdSchema` uses `parseInt` → `"12abc"` parses to `12` | `order.validation.ts` | `z.coerce.number().int().positive()` |
| Mid-file `import { JwtService }` in gateway | `gateway/src/server.ts` | Move to top (hoisting makes it work; it's just readability) |
| Event type strings (`OrderCreated`, `InventoryReserved`…) hardcoded in 3 services | consumers + relay | The shared package comment already promises it: add `shared/src/events/order-events.ts` with a union type + payload interfaces |
| Relay/consumers start before `app.listen` and before DB is reachable; first query failure → `process.exit(1)` at boot | `order-service/src/server.ts` | Start workers after a successful `pool.query('SELECT 1')`, add a startup retry |
| bcrypt still `genSalt` + `hash` two-step | `userService.ts` | `await bcrypt.hash(data.password, 10)` |

---

# Still open from V1 (unchanged, by fix id)

- **F9** — blocking `KEYS` in `createProduct` (one-line swap to `scanIterator` + `unlink`, code in V1 report).
- **F11** — `/ready` readiness probes with DB checks (code in V1 report).
- **F12** — gateway helmet, per-route auth rate limit, upstream timeouts.
- **F13** — `/api/v1` edge versioning.
- **F15** — batch `POST /api/products/prices`.
- **P3-5** — order list endpoint with pagination (`PaginatedResult<T>` is already in shared, unused).

---

# Recommended order (V2)

## Phase A — make CI green (~half a day)
- [ ] N5: root `vitest.config.ts` excluding `dist/`, class-based ioredis mock
- [ ] N7 (idempotency.ts part only): switch to `getRedisClient()` — kills the real-connection leak in tests
- [ ] Add the saga + gateway-auth test to lock in Phase 2 of V1

## Phase B — saga failure paths (~1 day)
- [ ] N2 compensation + `releaseStock`
- [ ] N3 marker-after-success
- [ ] N1 `XAUTOCLAIM` reclaim loop + `XADD ... MAXLEN`
- [ ] N6 relay claim via `UPDATE ... RETURNING` + outbox purge job

## Phase C — authz + hardening (~1–2 days)
- [ ] N4 roles + `requireRole('admin')` on inventory/product writes
- [ ] F9 SCAN invalidation, N8 cache revert, F11 `/ready`, F12 gateway hardening
- [ ] F13 versioning, F15 batch prices, N9 cleanups

**Outcome estimate:** Phase A alone takes the repo to a trustworthy state (green CI). A+B closes every correctness gap in the distributed flow → ~8/10. C is production-hardening → 8.5.
