import { createHash, randomUUID } from 'node:crypto';
import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AccessTokenPayload, RefreshTokenPayload } from '../types';

// Algoritmo fijado explícitamente: evita ataques de confusión de algoritmo ("alg": "none", RS/HS).
const ALGORITHM = 'HS256' as const;

const verifyOptions: VerifyOptions = {
  algorithms: [ALGORITHM],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

function signOptions(expiresIn: string): SignOptions {
  return {
    algorithm: ALGORITHM,
    expiresIn: expiresIn as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  };
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, env.JWT_ACCESS_SECRET, signOptions(env.JWT_ACCESS_EXPIRES_IN));
}

/** Cada refresh token lleva un jti único para permitir rotación y detección de reutilización. */
export function signRefreshToken(sub: string): string {
  const payload: RefreshTokenPayload = { sub, typ: 'refresh', jti: randomUUID() };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, signOptions(env.JWT_REFRESH_EXPIRES_IN));
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, verifyOptions) as AccessTokenPayload;
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') throw new jwt.JsonWebTokenError('invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, verifyOptions) as RefreshTokenPayload;
  if (payload.typ !== 'refresh' || typeof payload.sub !== 'string') throw new jwt.JsonWebTokenError('invalid token type');
  return payload;
}

export function durationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  const multipliers: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  if (!match?.[1] || !match[2]) return 7 * multipliers.d!;
  return Number.parseInt(match[1], 10) * multipliers[match[2]]!;
}

export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));
}

/** Los refresh tokens se almacenan sólo como hash SHA-256 (nunca en claro). */
export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}
