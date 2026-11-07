import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';
import { BadRequestError } from '../utils/errors';

type RequestTarget = 'body' | 'query' | 'params';

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export function validate(schema: ZodType, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target] ?? {});

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; ');
      next(new BadRequestError(message, 'VALIDATION_ERROR'));
      return;
    }

    if (target === 'query') {
      // En Express 5 req.query es de sólo lectura.
      req.validatedQuery = result.data as Record<string, unknown>;
    } else {
      req[target] = result.data;
    }

    next();
  };
}
