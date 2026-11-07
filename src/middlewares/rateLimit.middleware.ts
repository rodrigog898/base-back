import rateLimit, { Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { auditLogger } from '../config/logger';
import { clientIp, isLocalhostIp } from '../utils/network';

const shouldSkip = (req: Request): boolean => env.RATE_LIMIT_SKIP_LOCALHOST && isLocalhostIp(clientIp(req));

function limiter(name: string, windowMs: number, limit: number, message: string) {
  const handler: Options['handler'] = (req, res, _next, options) => {
    auditLogger.warn(
      { event: { category: 'network', action: 'rate-limit-exceeded', outcome: 'failure' }, limiter: name, ip: clientIp(req) },
      'Rate limit exceeded'
    );
    res.status(options.statusCode).json({ success: false, code: 'TOO_MANY_REQUESTS', message });
  };

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: shouldSkip,
    handler,
  });
}

export const globalRateLimiter = limiter(
  'global',
  env.RATE_LIMIT_WINDOW_MS,
  env.RATE_LIMIT_MAX,
  'Demasiadas solicitudes, inténtalo más tarde'
);

export const authRateLimiter = limiter(
  'auth',
  env.AUTH_RATE_LIMIT_WINDOW_MS,
  env.AUTH_RATE_LIMIT_MAX,
  'Demasiados intentos de autenticación, inténtalo más tarde'
);

export const clientLogsRateLimiter = limiter('client-logs', 60_000, 30, 'Demasiados reportes, inténtalo más tarde');
