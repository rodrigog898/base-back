import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { jwtConfig } from '../config/jwt';
import { JwtPayload } from '../types';

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: jwtConfig.accessExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, jwtConfig.accessSecret, options);
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: jwtConfig.refreshExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, jwtConfig.refreshSecret, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, jwtConfig.accessSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, jwtConfig.refreshSecret) as JwtPayload;
}

export function getRefreshTokenExpiry(): Date {
  const match = jwtConfig.refreshExpiresIn.match(/^(\d+)([dhms])$/);
  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + value * (multipliers[unit] ?? multipliers.d));
}

export function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}
