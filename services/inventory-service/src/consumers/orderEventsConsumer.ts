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
      'STREAMS', IN_STREAM, '>'
    );
    if (!batches) continue;

    for (const [, messages] of batches as any) {
      for (const [id, fields] of messages) {
        const map = new Map();
        for (let i = 0; i < fields.length; i += 2) {
            map.set(fields[i], fields[i + 1]);
        }
        if (map.get('eventType') !== 'OrderCreated') { await redis.xack(IN_STREAM, GROUP, id); continue; }

        const event = JSON.parse(map.get('payload')!);
        // Idempotency check
        const processed = await redis.set(`inv:processed:${event.orderId}`, '1', 'EX', 86400, 'NX');
        if (!processed) {
            await redis.xack(IN_STREAM, GROUP, id);
            continue;
        }

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
