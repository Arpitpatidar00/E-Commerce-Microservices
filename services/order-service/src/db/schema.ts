import { pgTable, serial, varchar, timestamp, integer, decimal, jsonb } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 256 }).notNull(),
  status: varchar('status', { length: 50 }).default('CREATED').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  productId: varchar('product_id', { length: 256 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
});

export const outboxEvents = pgTable('outbox_events', {
  id: serial('id').primaryKey(),
  aggregateId: varchar('aggregate_id', { length: 256 }).notNull(), // e.g., order.id
  aggregateType: varchar('aggregate_type', { length: 256 }).notNull(), // 'Order'
  eventType: varchar('event_type', { length: 256 }).notNull(), // 'OrderCreated'
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(), // PENDING, PUBLISHED
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
