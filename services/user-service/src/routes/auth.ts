import { FastifyPluginAsync } from 'fastify';
import * as authController from '../controllers/auth';
import { validateRequest, authMiddleware } from '@ecommerce/shared';
import { createUserRequestSchema, loginUserRequestSchema } from '../validations/user.validation';

const authRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/register', {
    preHandler: validateRequest({ body: createUserRequestSchema }) as any
  }, authController.register);
  
  fastify.post('/login', {
    preHandler: validateRequest({ body: loginUserRequestSchema }) as any
  }, authController.login);
  
  fastify.get('/me', {
    preHandler: authMiddleware as any
  }, authController.getMe);
};

export default authRoutes;
