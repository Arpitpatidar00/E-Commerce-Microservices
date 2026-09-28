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

    for (const [, messages] of batches as any) {
      for (const [id, fields] of messages) {
        const map = new Map();
        for (let i = 0; i < fields.length; i += 2) {
            map.set(fields[i], fields[i + 1]);
        }
        const event = JSON.parse(map.get('payload')!);
        const status = map.get('eventType') === 'InventoryReserved' ? 'CONFIRMED' : 'REJECTED';
        await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, event.orderId));
        await redis.xack(STREAM, GROUP, id);
      }
    }
  }
};
