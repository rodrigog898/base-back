import type { Request } from 'express';

/**
 * IP del cliente. Se usa req.ip, que respeta la configuración TRUST_PROXY;
 * nunca se lee X-Forwarded-For directamente (es falsificable por el cliente).
 */
export function clientIp(req: Request): string | undefined {
  const ip = req.ip?.trim();
  return ip || undefined;
}

export function isLocalhostIp(ip: string | null | undefined): boolean {
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
}

export function requestMeta(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: clientIp(req),
    userAgent: req.get('user-agent')?.slice(0, 512),
  };
}
