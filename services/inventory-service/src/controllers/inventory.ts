import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryService } from '../services/inventoryService';
import { ApiResponse, HttpStatus } from '@ecommerce/shared';

const setStockSchema = z.object({
  quantity: z.number().int().min(0)
});

const reserveStockSchema = z.object({
  quantity: z.number().int().min(1)
});

export const getStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  const inventory = await inventoryService.getStock(req.params.productId);
  return ApiResponse.sendSuccess(reply, inventory, 'Inventory fetched successfully', HttpStatus.OK);
};

export const setStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  const data = setStockSchema.parse(req.body);
  const inventory = await inventoryService.setStock(req.params.productId, data.quantity);
  return ApiResponse.sendSuccess(reply, inventory, 'Inventory updated successfully', HttpStatus.OK);
};

export const reserveStock = async (req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
  // In Phase C, we will add Idempotency checks here to prevent double reservation on retry
  const data = reserveStockSchema.parse(req.body);
  const inventory = await inventoryService.reserveStock(req.params.productId, data.quantity);
  return ApiResponse.sendSuccess(reply, inventory, 'Stock reserved successfully', HttpStatus.OK);
};
