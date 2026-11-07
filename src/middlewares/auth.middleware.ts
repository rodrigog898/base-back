import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/tokens';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { UserRepository } from '../repositories/user.repository';
import { setContextUser } from '../context/requestContext';
import { auditLogger } from '../config/logger';
import { clientIp } from '../utils/network';
import { AuthenticatedUser } from '../types';
import { isUserAccessAllowed } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Autenticación por Bearer token (A.8.5).
 * El estado del usuario se verifica en cada request para que un bloqueo o
 * desactivación tenga efecto inmediato aunque el access token siga vigente.
 */
export function createAuthenticate(userRepository: UserRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Token de acceso requerido', 'TOKEN_REQUIRED'));
      return;
    }

    let payload;
    try {
      payload = verifyAccessToken(authHeader.slice(7).trim());
    } catch {
      next(new UnauthorizedError('Token de acceso inválido o expirado', 'INVALID_TOKEN'));
      return;
    }

    try {
      const user = await userRepository.findById(payload.sub);
      if (!user || !isUserAccessAllowed(user)) {
        next(new UnauthorizedError('Token de acceso inválido o expirado', 'INVALID_TOKEN'));
        return;
      }

      // El rol se toma de la base de datos, no del token (evita privilegios obsoletos).
      req.user = { sub: user.id, role: user.role };
      setContextUser(user.id);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authorize(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Autenticación requerida'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      auditLogger.warn(
        {
          event: { category: 'iam', action: 'authorization-denied', outcome: 'failure' },
          requiredRoles: roles,
          role: req.user.role,
          path: req.originalUrl.split('?')[0],
          ip: clientIp(req),
        },
        'Authorization denied'
      );
      next(new ForbiddenError('Permisos insuficientes', 'INSUFFICIENT_PERMISSIONS'));
      return;
    }

    next();
  };
}
