import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './AppError';
import { HttpStatus } from '../constants/httpStatus';
import { Messages } from '../constants/messages';
import { ZodError } from 'zod';
import { ApiResponse } from '../responses/ApiResponse';

export const errorHandler = (
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  request.log.error(error);

  if (error instanceof ZodError) {
    return reply.status(HttpStatus.BAD_REQUEST).send(
      ApiResponse.error(Messages.VALIDATION_FAILED, error.errors, request.url)
    );
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(
      ApiResponse.error(error.message, null, request.url)
    );
  }

  // Fallback for unhandled errors
  return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(
    ApiResponse.error(Messages.INTERNAL_SERVER_ERROR, null, request.url)
  );
};
