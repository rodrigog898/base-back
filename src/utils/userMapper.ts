import { User } from '@prisma/client';
import { SafeUser } from '../types';

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive ?? true,
    isBlocked: user.isBlocked ?? false,
    lastConnectionAt: user.lastConnectionAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
