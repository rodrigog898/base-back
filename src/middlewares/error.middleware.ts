import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError } from 'jsonwebtoken';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';
import { mapPublicError } from '../utils/mapPublicError';
import { getContext } from '../context/requestContext';

type BodyParserError = Error & { type?: string; status?: number };

function send(res: Response, statusCode: number, code: string, message: string): void {
  res.status(statusCode).json({
    success: false,
    code,
    message,
    // Permite a soporte correlacionar el error con los logs sin exponer detalles internos.
    requestId: getContext()?.requestId,
  });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err }, err.message);
    else logger.info({ errCode: err.code, statusCode: err.statusCode }, err.message);
    send(res, err.statusCode, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    send(res, 400, 'VALIDATION_ERROR', err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
    return;
  }

  if (err instanceof JsonWebTokenError) {
    send(res, 401, 'INVALID_TOKEN', 'Token inválido');
    return;
  }

  const bodyError = err as BodyParserError;
  if (bodyError.type === 'entity.parse.failed') {
    send(res, 400, 'MALFORMED_JSON', 'JSON inválido');
    return;
  }
  if (bodyError.type === 'entity.too.large') {
    send(res, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande');
    return;
  }

  logger.error({ err }, 'Unhandled error');

  const mapped = mapPublicError(err);
  send(res, mapped.statusCode, mapped.statusCode === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR', mapped.message);
}

export function notFoundHandler(_req: Request, res: Response): void {
  send(res, 404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada');
}
