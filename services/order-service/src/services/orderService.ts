import { orderRepository } from '../repositories/orderRepository';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import CircuitBreaker from 'opossum';
import { CreateOrderRequest, Order, OrderModel } from '../types/order.types';

const client = axios.create();
axiosRetry(client, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry on 5xx errors or network errors
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 500;
  }
});

const fetchProductPrice = async (productId: string, productServiceUrl: string) => {
  const response = await client.get(`${productServiceUrl}/api/products/${productId}`, {
    timeout: 5000
  });
  return response.data.data; // Using standardized ApiResponse
};

// Circuit breaker opens after 50% failures, requires 5 requests to trip, and waits 10s before half-open
const breaker = new CircuitBreaker(fetchProductPrice, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  volumeThreshold: 5
});

breaker.fallback(() => {
  throw new Error("Product Service is currently unavailable. Please try again later.");
});

export class OrderService {
  private productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    let totalAmount = 0;
    const itemsWithPrices = [];

    // Fetch authoritative prices from Product Service using Circuit Breaker & Retries
    for (const item of data.items) {
      try {
        const product = await breaker.fire(item.productId, this.productServiceUrl) as any;
        
        const price = product.price;
        totalAmount += price * item.quantity;
        
        itemsWithPrices.push({
          productId: item.productId,
          quantity: item.quantity,
          price: price.toString()
        });
      } catch (error: any) {
        throw new Error(`Failed to fetch price for product ${item.productId}: ${error.message}`);
      }
    }

    const doc = await orderRepository.createOrderWithOutbox({
      userId: data.userId,
      totalAmount: totalAmount.toString(),
      items: itemsWithPrices
    });

    return {
      id: doc.id,
      userId: doc.userId,
      status: doc.status as any,
      totalAmount: doc.totalAmount,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString()
    };
  }

  async getOrderById(id: number): Promise<Order> {
    const order = await orderRepository.findById(id);
    if (!order) {
      throw new Error('Order not found');
    }
    return {
      id: order.id,
      userId: order.userId,
      status: order.status as any,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map(i => ({
        id: i.id,
        productId: i.productId,
        quantity: i.quantity,
        price: i.price
      }))
    };
  }
}

export const orderService = new OrderService();
