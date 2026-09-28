import { productRepository } from '../repositories/productRepository';
import { redisClient } from '../config/db';
import { CreateProductRequest, GetProductsQuery, Product, ProductsResult } from '../types/product.types';
import { NotFoundError } from '@ecommerce/shared';

export class ProductService {
  private async getOrSetCache<T>(cacheKey: string, ttl: number, fetchFn: () => Promise<T>): Promise<T> {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.error(`Redis get failed for ${cacheKey}`, e);
    }

    const lockKey = `lock:${cacheKey}`;
    const acquired = await redisClient.set(lockKey, '1', 'EX', 10, 'NX').catch(() => null);
    
    if (acquired) {
      try {
        const result = await fetchFn();
        try {
          await redisClient.set(cacheKey, JSON.stringify(result), 'EX', ttl);
        } catch (e) {
          console.error(`Redis set failed for ${cacheKey}`, e);
        }
        return result;
      } finally {
        await redisClient.del(lockKey).catch(() => null);
      }
    } else {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        try {
          const retryCached = await redisClient.get(cacheKey);
          if (retryCached) return JSON.parse(retryCached);
        } catch (e) {}
      }
      return fetchFn(); // Fallback to fetching directly if lock times out
    }
  }

  async getProducts(query: GetProductsQuery): Promise<ProductsResult> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const cacheKey = `products:page:${page}:limit:${limit}`;
    
    return this.getOrSetCache(cacheKey, 300, async () => {
      const result = await productRepository.findAll({ page, limit });
      return {
        items: result.items.map(doc => ({
          id: doc._id.toString(),
          name: doc.name,
          description: doc.description,
          price: doc.price,
          stock: doc.stock,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString()
        })),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      };
    });
  }

  async getProductById(id: string): Promise<Product> {
    const cacheKey = `product:${id}`;
    
    return this.getOrSetCache(cacheKey, 300, async () => {
      const doc = await productRepository.findById(id);
      if (!doc) {
        throw new NotFoundError('Product not found');
      }

      return {
        id: doc._id.toString(),
        name: doc.name,
        description: doc.description,
        price: doc.price,
        stock: doc.stock,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString()
      };
    });
  }

  async createProduct(data: CreateProductRequest): Promise<Product> {
    const doc = await productRepository.create(data);
    const product: Product = {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      price: doc.price,
      stock: doc.stock,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString()
    };
    
    try {
      // Simplistic invalidation for demo purposes; ideally use pattern matching or just rely on TTL
      const keys = await redisClient.keys('products:page:*');
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (e) {
      console.error('Redis failed during createProduct invalidate', e);
    }

    return product;
  }
}

export const productService = new ProductService();
