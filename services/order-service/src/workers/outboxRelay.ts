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
        .for('update', { skipLocked: true })
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
