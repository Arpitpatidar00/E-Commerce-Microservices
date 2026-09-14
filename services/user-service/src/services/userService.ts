import bcrypt from "bcryptjs";
import { userRepository } from "../repositories/userRepository";
import { CreateUserRequest, LoginUserRequest, User } from "../types/user.types";

export class UserService {
  async registerUser(data: CreateUserRequest): Promise<User> {
    const existingUser = await userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error("User already exists");
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const user = await userRepository.create({
      email: data.email,
      passwordHash,
      name: data.name,
    });

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async verifyCredentials(data: LoginUserRequest): Promise<User> {
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async getUserById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error("User not found");
    }
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export const userService = new UserService();
