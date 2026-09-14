import { productRepository } from '../repositories/productRepository';
import { redisClient } from '../config/db';
import { CreateProductRequest, GetProductsQuery, Product, ProductsResult } from '../types/product.types';

export class ProductService {
  private inFlightRequests = new Map<string, Promise<any>>();

  private async executeWithStampedeProtection<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const promise = fetchFn().finally(() => {
      this.inFlightRequests.delete(key);
    });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  async getProducts(query: GetProductsQuery): Promise<ProductsResult> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const cacheKey = `products:page:${page}:limit:${limit}`;
    try {
      const cachedProducts = await redisClient.get(cacheKey);
      if (cachedProducts) {
        return JSON.parse(cachedProducts);
      }
    } catch (e) {
      console.error('Redis failed during getProducts get', e);
    }

    const result = await this.executeWithStampedeProtection(cacheKey, () => productRepository.findAll({ page, limit }));
    
    const formattedResult: ProductsResult = {
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

    try {
      await redisClient.set(cacheKey, JSON.stringify(formattedResult), 'EX', 300); // 5 min cache
    } catch (e) {
      console.error('Redis failed during getProducts set', e);
    }
    
    return formattedResult;
  }

  async getProductById(id: string): Promise<Product> {
    const cacheKey = `product:${id}`;
    
    try {
      const cachedProduct = await redisClient.get(cacheKey);
      if (cachedProduct) {
        return JSON.parse(cachedProduct);
      }
    } catch (e) {
      console.error('Redis failed during getProductById get', e);
    }

    const doc = await this.executeWithStampedeProtection(cacheKey, () => productRepository.findById(id));
    
    if (!doc) {
      throw new Error('Product not found');
    }

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
      await redisClient.set(cacheKey, JSON.stringify(product), 'EX', 300);
    } catch (e) {
      console.error('Redis failed during getProductById set', e);
    }

    return product;
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
