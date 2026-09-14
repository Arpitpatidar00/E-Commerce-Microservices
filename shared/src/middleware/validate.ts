import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }
      if (schemas.query) {
        request.query = schemas.query.parse(request.query);
      }
      if (schemas.params) {
        request.params = schemas.params.parse(request.params);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw error; // Will be caught by global error handler
      }
      throw error;
    }
  };
};
