import { FastifyReply } from 'fastify';
import { HttpStatus } from '../constants/httpStatus';

export class ApiResponse<T> {
  public success: boolean;
  public message: string;
  public data: T | null;
  public timestamp: string;
  public path?: string;

  private constructor(success: boolean, message: string, data: T | null = null, path?: string) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
    if (path) this.path = path;
  }

  static success<T>(data: T, message: string = 'Success') {
    return new ApiResponse<T>(true, message, data);
  }

  static error(message: string, errors: any = null, path?: string) {
    return new ApiResponse<any>(false, message, errors, path);
  }

  static sendSuccess<T>(reply: any, data: T, message: string = 'Success', statusCode: number = HttpStatus.OK) {
    return reply.status(statusCode).send(new ApiResponse<T>(true, message, data));
  }
}
