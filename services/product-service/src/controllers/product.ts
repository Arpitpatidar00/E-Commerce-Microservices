import { FastifyRequest, FastifyReply } from 'fastify';
import { productService } from '../services/productService';
import { HttpStatus, Messages, NotFoundError, ApiResponse } from '@ecommerce/shared';
import { CreateProductRequest, GetProductsQuery } from '../types/product.types';

export const createProduct = async (req: FastifyRequest, reply: FastifyReply) => {
  const data = req.body as CreateProductRequest;
  const product = await productService.createProduct(data);
  return ApiResponse.sendSuccess(reply, product, 'Product created successfully', HttpStatus.CREATED);
};

export const getProducts = async (req: FastifyRequest<{ Querystring: GetProductsQuery }>, reply: FastifyReply) => {
  const query = req.query;
  const result = await productService.getProducts(query);
  return ApiResponse.sendSuccess(reply, result, 'Products fetched successfully', HttpStatus.OK);
};

export const getProductById = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const { id } = req.params;
  try {
    const product = await productService.getProductById(id);
    return ApiResponse.sendSuccess(reply, product, 'Product fetched successfully', HttpStatus.OK);
  } catch (error: any) {
    if (error.message === 'Product not found') {
      throw new NotFoundError(Messages.PRODUCT_NOT_FOUND);
    }
    throw error;
  }
};
