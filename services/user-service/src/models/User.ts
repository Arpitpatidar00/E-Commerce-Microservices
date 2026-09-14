import mongoose from 'mongoose';
import { UserDocument } from '../types/user.types';

const userSchema = new mongoose.Schema<UserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const UserDocumentModel = mongoose.model<UserDocument>('User', userSchema);
