import { FastifyPluginAsync } from 'fastify';
import * as productController from '../controllers/product';
import { validateRequest } from '@ecommerce/shared';
import { createProductRequestSchema, getProductsQuerySchema, productIdSchema } from '../validations/product.validation';

const productRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/', {
    preHandler: validateRequest({ body: createProductRequestSchema }) as any
  }, productController.createProduct);
  
  fastify.get('/', {
    preHandler: validateRequest({ query: getProductsQuerySchema }) as any
  }, productController.getProducts);
  
  fastify.get('/:id', {
    preHandler: validateRequest({ params: productIdSchema }) as any
  }, productController.getProductById);
};

export default productRoutes;
