import { FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { HttpStatus, Messages, BadRequestError, UnauthorizedError, NotFoundError, ApiResponse, JwtService } from '@ecommerce/shared';
import { CreateUserRequest, LoginUserRequest } from '../types/user.types';

export const register = async (req: FastifyRequest, reply: FastifyReply) => {
  const data = req.body as CreateUserRequest;
  try {
    const user = await userService.registerUser(data);
    const token = JwtService.sign({ id: user.id, email: user.email });
    return ApiResponse.sendSuccess(reply, { token, user }, 'User registered successfully', HttpStatus.CREATED);
  } catch (error: any) {
    if (error.message === 'User already exists') {
      throw new BadRequestError(Messages.USER_ALREADY_EXISTS);
    }
    throw error;
  }
};

export const login = async (req: FastifyRequest, reply: FastifyReply) => {
  const data = req.body as LoginUserRequest;
  try {
    const user = await userService.verifyCredentials(data);
    const token = JwtService.sign({ id: user.id, email: user.email });
    return ApiResponse.sendSuccess(reply, { token, user }, 'Login successful', HttpStatus.OK);
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      throw new BadRequestError(Messages.INVALID_CREDENTIALS);
    }
    throw error;
  }
};

export const getMe = async (req: FastifyRequest, reply: FastifyReply) => {
  const payload = (req as any).user as { id: string };
  
  try {
    const user = await userService.getUserById(payload.id);
    return ApiResponse.sendSuccess(reply, { user }, 'User details fetched successfully', HttpStatus.OK);
  } catch (error: any) {
    if (error.message === 'User not found') {
      throw new NotFoundError(Messages.NOT_FOUND);
    }
    throw error;
  }
};
