import { FastifyRequest, FastifyReply } from 'fastify';
import { orderService } from '../services/orderService';
import { HttpStatus, Messages, BadRequestError, NotFoundError, ApiResponse } from '@ecommerce/shared';
import { CreateOrderRequest } from '../types/order.types';

export const createOrder = async (req: FastifyRequest, reply: FastifyReply) => {
  const data = req.body as CreateOrderRequest;
  const userId = (req as any).user.id;
  const order = await orderService.createOrder(data, userId);
  return ApiResponse.sendSuccess(reply, order, 'Order created successfully', HttpStatus.CREATED);
};

export const getOrderById = async (req: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => {
  const { id } = req.params;
  const order = await orderService.getOrderById(id);
  return ApiResponse.sendSuccess(reply, order, 'Order fetched successfully', HttpStatus.OK);
};
