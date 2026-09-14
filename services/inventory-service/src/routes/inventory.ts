import { FastifyPluginAsync } from 'fastify';
import * as inventoryController from '../controllers/inventory';

const inventoryRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.get('/:productId', inventoryController.getStock);
  fastify.post('/:productId', inventoryController.setStock);
  fastify.post('/:productId/reserve', inventoryController.reserveStock);
};

export default inventoryRoutes;
