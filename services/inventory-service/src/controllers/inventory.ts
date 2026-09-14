import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryService } from '../services/inventoryService';

const setStockSchema = z.object({
  quantity: z.number().int().min(0)
});

const reserveStockSchema = z.object({
  quantity: z.number().int().min(1)
});

export const getStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  try {
    const inventory = await inventoryService.getStock(req.params.productId);
    reply.send(inventory);
  } catch (error: any) {
    if (error.message === 'Inventory not found') {
      return reply.status(404).send({ message: error.message });
    }
    req.log.error(error);
    reply.status(500).send({ message: 'Internal server error' });
  }
};

export const setStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  try {
    const data = setStockSchema.parse(req.body);
    const inventory = await inventoryService.setStock(req.params.productId, data.quantity);
    reply.send(inventory);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    req.log.error(error);
    reply.status(500).send({ message: 'Internal server error' });
  }
};

export const reserveStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  try {
    // In Phase C, we will add Idempotency checks here to prevent double reservation on retry
    const data = reserveStockSchema.parse(req.body);
    const inventory = await inventoryService.reserveStock(req.params.productId, data.quantity);
    reply.send(inventory);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message === 'Insufficient stock or product not found') {
      return reply.status(409).send({ message: error.message });
    }
    req.log.error(error);
    reply.status(500).send({ message: 'Internal server error' });
  }
};
