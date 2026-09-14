import { db } from '../db';
import { orders, orderItems, outboxEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { OrderModel, OrderItemModel } from '../types/order.types';

export class OrderRepository {
  async createOrderWithOutbox(data: { userId: string, totalAmount: string, items: { productId: string, quantity: number, price: string }[] }) {
    return await db.transaction(async (tx) => {
      // 1. Create Order
      const [newOrder] = await tx.insert(orders).values({
        userId: data.userId,
        totalAmount: data.totalAmount,
        status: 'CREATED'
      }).returning();

      // 2. Create Order Items
      const itemsToInsert = data.items.map(item => ({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price
      }));
      await tx.insert(orderItems).values(itemsToInsert);
      
      // 3. Write Event to Outbox (Transactional Outbox Pattern)
      const eventPayload = {
        orderId: newOrder.id,
        userId: newOrder.userId,
        totalAmount: newOrder.totalAmount,
        items: itemsToInsert,
        timestamp: new Date().toISOString()
      };

      await tx.insert(outboxEvents).values({
        aggregateId: newOrder.id.toString(),
        aggregateType: 'Order',
        eventType: 'OrderCreated',
        payload: eventPayload
      });

      return newOrder as OrderModel;
    });
  }

  async findById(id: number) {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    }) as OrderModel | undefined;
    
    if (!order) return null;
    
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)) as OrderItemModel[];
    
    return { ...order, items };
  }
}

export const orderRepository = new OrderRepository();
