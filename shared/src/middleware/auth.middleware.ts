import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../errors/AppError';
import { Messages } from '../constants/messages';
import { JwtService } from '../services/jwt.service';

export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError(Messages.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    const payload = JwtService.verify(token);
    (request as any).user = payload;
  } catch (error) {
    throw new UnauthorizedError(Messages.UNAUTHORIZED);
  }
};
