import { z } from 'zod';
import { createProductRequestSchema, getProductsQuerySchema } from '../validations/product.validation';
import { ApiResponse, PaginatedResult } from '@ecommerce/shared';
import { Document, Types } from 'mongoose';

// ============================================================
// MAIN TYPE (API Representation)
// ============================================================

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
};

// ============================================================
// DATABASE DOCUMENT TYPE
// ============================================================

export interface ProductDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// COLLECTIONS
// ============================================================

export type ProductsList = Product[];

// ============================================================
// REQUEST/QUERY TYPES
// ============================================================

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type GetProductsQuery = z.infer<typeof getProductsQuerySchema>;

// ============================================================
// RESULT TYPES
// ============================================================

export type ProductsResult = PaginatedResult<Product>;

// ============================================================
// RESPONSE TYPES
// ============================================================

export type ProductResponse = ApiResponse<Product>;
export type ProductsResponse = ApiResponse<ProductsResult>;
