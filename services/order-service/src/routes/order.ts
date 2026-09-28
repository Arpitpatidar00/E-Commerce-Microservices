import { FastifyPluginAsync } from 'fastify';
import * as orderController from '../controllers/order';
import { createOrderRequestSchema, orderIdSchema } from '../validations/order.validation';
import { authMiddleware, validateRequest } from '@ecommerce/shared';

const orderRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/', {
    config: { idempotency: true },
    preHandler: [authMiddleware as any, validateRequest({ body: createOrderRequestSchema }) as any]
  }, orderController.createOrder);
  
  fastify.get('/:id', {
    preHandler: [authMiddleware as any, validateRequest({ params: orderIdSchema }) as any]
  }, orderController.getOrderById);
};

export default orderRoutes;
