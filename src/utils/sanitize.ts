import { NextFunction, Request, Response } from 'express';

const PROHIBITED_KEY_PATTERN = /^\$|\./;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (PROHIBITED_KEY_PATTERN.test(key)) {
      const safeKey = key.replace(/^\$/, '_').replace(/\./g, '_');
      obj[safeKey] = sanitizeValue(obj[key]);
      delete obj[key];
      continue;
    }

    obj[key] = sanitizeValue(obj[key]);
  }

  return obj;
}

export function sanitizeInputs(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body as Record<string, unknown>);
  }

  next();
}
