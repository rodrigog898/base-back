import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { isLocalhostIp, resolveClientIp } from '../utils/clientIp';

const shouldSkipRateLimit = (req: Request): boolean =>
  env.RATE_LIMIT_SKIP_LOCALHOST && isLocalhostIp(resolveClientIp(req));

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  message: {
    success: false,
    message: 'Demasiadas solicitudes, inténtalo más tarde',
  },
});

export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  message: {
    success: false,
    message: 'Demasiados intentos de autenticación, inténtalo más tarde',
  },
});
