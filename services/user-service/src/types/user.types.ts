import { z } from 'zod';
import { createUserRequestSchema, loginUserRequestSchema } from '../validations/user.validation';
import { ApiResponse } from '@ecommerce/shared';
import { Document, Types } from 'mongoose';

// ============================================================
// MAIN TYPE (API Representation)
// ============================================================

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

// ============================================================
// DATABASE DOCUMENT TYPE
// ============================================================

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
}

// ============================================================
// REQUEST TYPES
// ============================================================

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type LoginUserRequest = z.infer<typeof loginUserRequestSchema>;

// ============================================================
// RESPONSE TYPES
// ============================================================

export type UserResponse = ApiResponse<{ user: User }>;
export type AuthResponse = ApiResponse<{ token: string; user: User }>;
