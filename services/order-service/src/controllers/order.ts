import { FastifyRequest, FastifyReply } from 'fastify';
import { orderService } from '../services/orderService';
import { HttpStatus, Messages, BadRequestError, NotFoundError, ApiResponse } from '@ecommerce/shared';
import { CreateOrderRequest } from '../types/order.types';

export const createOrder = async (req: FastifyRequest, reply: FastifyReply) => {
  const data = req.body as CreateOrderRequest;
  try {
    const order = await orderService.createOrder(data);
    return ApiResponse.sendSuccess(reply, order, 'Order created successfully', HttpStatus.CREATED);
  } catch (error: any) {
    if (error.message.startsWith('Failed to fetch price')) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

export const getOrderById = async (req: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => {
  const { id } = req.params;
  try {
    const order = await orderService.getOrderById(id);
    return ApiResponse.sendSuccess(reply, order, 'Order fetched successfully', HttpStatus.OK);
  } catch (error: any) {
    if (error.message === 'Order not found') {
      throw new NotFoundError(Messages.ORDER_NOT_FOUND);
    }
    throw error;
  }
};
