import { z } from 'zod';
import { createOrderRequestSchema, orderIdSchema } from '../validations/order.validation';
import { ApiResponse } from '@ecommerce/shared';

// ============================================================
// ENUMS & SUPPORTING TYPES
// ============================================================

export type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type OrderItem = {
  id: number;
  productId: string;
  quantity: number;
  price: string; // Stored as decimal string
};

// ============================================================
// MAIN TYPE (API Representation)
// ============================================================

export type Order = {
  id: number;
  userId: string;
  status: OrderStatus;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
};

// ============================================================
// DATABASE MODELS (Drizzle)
// ============================================================

export type OrderModel = {
  id: number;
  userId: string;
  status: string;
  totalAmount: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderItemModel = {
  id: number;
  orderId: number;
  productId: string;
  quantity: number;
  price: string;
};

// ============================================================
// COLLECTIONS
// ============================================================

export type OrdersList = Order[];

// ============================================================
// REQUEST TYPES
// ============================================================

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// ============================================================
// RESPONSE TYPES
// ============================================================

export type OrderResponse = ApiResponse<Order>;
