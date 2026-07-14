import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/tokens';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: Role;
      };
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Token de acceso requerido'));
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        isActive: true,
        isBlocked: true,
        bannedUntil: true,
      },
    });

    if (!user) {
      next(new UnauthorizedError('Token de acceso inválido o expirado'));
      return;
    }

    if (user.isActive === false) {
      next(new ForbiddenError('Este usuario está desactivado'));
      return;
    }

    if (user.isBlocked === true) {
      next(new ForbiddenError('Acceso denegado'));
      return;
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      next(new ForbiddenError('Acceso denegado'));
      return;
    }

    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Token de acceso inválido o expirado'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Autenticación requerida'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Permisos insuficientes'));
      return;
    }

    next();
  };
}
