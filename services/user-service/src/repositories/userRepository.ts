import { UserDocumentModel } from '../models/User';
import { CreateUserRequest, UserDocument } from '../types/user.types';

export class UserRepository {
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserDocumentModel.findOne({ email });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return UserDocumentModel.findById(id).select('-passwordHash');
  }

  async create(data: Omit<CreateUserRequest, 'password'> & { passwordHash: string }): Promise<UserDocument> {
    const user = new UserDocumentModel(data);
    await user.save();
    return user;
  }
}

export const userRepository = new UserRepository();
