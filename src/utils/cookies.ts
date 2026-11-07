import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { durationToMs } from './tokens';

/**
 * El refresh token viaja sólo en una cookie HttpOnly + Secure + SameSite
 * (no accesible desde JavaScript: mitiga robo por XSS).
 */
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    ...baseOptions(),
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, baseOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[env.REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 && value.length < 2048 ? value : undefined;
}
