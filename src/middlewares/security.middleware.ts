import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from '../config/env';
import { ForbiddenError } from '../utils/errors';

/** Cabeceras de seguridad para una API JSON (A.8.20 / A.8.26). */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  xFrameOptions: { action: 'deny' },
});

/** Las respuestas de la API no deben quedar en cachés intermedias. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

/**
 * Protección CSRF para endpoints que dependen de la cookie de refresh:
 * exige un Origin (o Referer) incluido en la lista blanca de CORS.
 * Complementa SameSite=Strict.
 */
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin') ?? safeOrigin(req.get('referer'));
  if (origin && corsOrigins.includes(origin)) {
    next();
    return;
  }
  next(new ForbiddenError('Origen no permitido', 'ORIGIN_NOT_ALLOWED'));
}

function safeOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
