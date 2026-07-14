import type { Request } from 'express';

export const resolveClientIp = (req: Request): string | null => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    return first || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0] ?? null;
  }
  return req.ip ?? null;
};

export const isLocalhostIp = (ip: string | null): boolean =>
  ip === '::1'
  || ip === '127.0.0.1'
  || ip === '::ffff:127.0.0.1'
  || ip === 'localhost';
