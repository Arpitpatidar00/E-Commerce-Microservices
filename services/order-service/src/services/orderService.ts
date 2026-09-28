import { orderRepository } from '../repositories/orderRepository';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import CircuitBreaker from 'opossum';
import { CreateOrderRequest, Order, OrderModel } from '../types/order.types';
import { NotFoundError, ServiceUnavailableError } from '@ecommerce/shared';

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

const breaker = new CircuitBreaker(fetchProductPrice, {
  timeout: 2000,
  errorThresholdPercentage: 50,
  resetTimeout: 5000,
  volumeThreshold: 10
});

breaker.fallback(() => {
  throw new ServiceUnavailableError("Product Service is currently unavailable. Please try again later.");
});

export class OrderService {
  private productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

  async createOrder(data: CreateOrderRequest, userId: string): Promise<Order> {
    const pricePromises = data.items.map(async (item) => {
      try {
        const product = await breaker.fire(item.productId, this.productServiceUrl) as any;
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: product.price,
        };
      } catch (error: any) {
        throw new ServiceUnavailableError(`Price lookup failed for product ${item.productId}`);
      }
    });

    const fetchedItems = await Promise.all(pricePromises);
    let totalAmount = 0;
    const itemsWithPrices = fetchedItems.map(item => {
      totalAmount += item.price * item.quantity;
      return {
        ...item,
        price: item.price.toString()
      };
    });

    const doc = await orderRepository.createOrderWithOutbox({
      userId,
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
      throw new NotFoundError('Order not found');
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
