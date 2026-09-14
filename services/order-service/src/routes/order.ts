import { FastifyPluginAsync } from 'fastify';
import * as orderController from '../controllers/order';
import { validateRequest } from '@ecommerce/shared';
import { createOrderRequestSchema, orderIdSchema } from '../validations/order.validation';

const orderRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/', {
    preHandler: validateRequest({ body: createOrderRequestSchema }) as any
  }, orderController.createOrder);
  
  fastify.get('/:id', {
    preHandler: validateRequest({ params: orderIdSchema }) as any
  }, orderController.getOrderById);
};

export default orderRoutes;
