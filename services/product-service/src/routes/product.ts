import { FastifyPluginAsync } from 'fastify';
import * as productController from '../controllers/product';
import { createProductRequestSchema, getProductsQuerySchema, productIdSchema } from '../validations/product.validation';
import { authMiddleware, validateRequest } from '@ecommerce/shared';

const productRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/', {
    preHandler: [authMiddleware as any, validateRequest({ body: createProductRequestSchema }) as any]
  }, productController.createProduct);
  
  fastify.get('/', {
    preHandler: validateRequest({ query: getProductsQuerySchema }) as any
  }, productController.getProducts);
  
  fastify.get('/:id', {
    preHandler: validateRequest({ params: productIdSchema }) as any
  }, productController.getProductById);
};

export default productRoutes;
