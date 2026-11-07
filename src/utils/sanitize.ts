import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { BadRequestError } from './errors';

/**
 * Protección contra NoSQL injection y prototype pollution (A.8.28).
 * En lugar de reescribir claves silenciosamente, la request se rechaza:
 * un cliente legítimo nunca envía claves "$..." , con "." o "__proto__".
 */
const OPERATOR_KEY = /^\$|\./;
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DEPTH = 10;

export function findUnsafeKey(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return '<max-depth>';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (OPERATOR_KEY.test(key) || POLLUTION_KEYS.has(key)) return key;
      const found = findUnsafeKey((value as Record<string, unknown>)[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function rejectUnsafeInput(req: Request, _res: Response, next: NextFunction): void {
  for (const [target, value] of [
    ['body', req.body],
    ['query', req.query],
    ['params', req.params],
  ] as const) {
    const key = findUnsafeKey(value);
    if (key) {
      logger.warn(
        { event: { category: 'web', action: 'unsafe-input-rejected', outcome: 'failure' }, target, key: key.slice(0, 64) },
        'Unsafe input rejected'
      );
      next(new BadRequestError('La solicitud contiene parámetros no permitidos', 'UNSAFE_INPUT'));
      return;
    }
  }
  next();
}
