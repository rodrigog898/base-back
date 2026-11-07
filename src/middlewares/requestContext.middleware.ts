import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { accessLogger } from '../config/logger';
import { runWithContext } from '../context/requestContext';

const REQUEST_ID_HEADER = 'x-request-id';
// Sólo se acepta un request id entrante con formato seguro (evita log injection).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

type RequestWithId = IncomingMessage & { id?: string; user?: { sub: string } };

function resolveRequestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}

/** Asigna X-Request-Id y abre el contexto de AsyncLocalStorage para la request. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req);
  res.setHeader('X-Request-Id', requestId);
  (req as RequestWithId).id = requestId;
  runWithContext({ requestId, ip: req.ip }, () => next());
}

function stripQuery(url: string | undefined): string | undefined {
  // La query string puede llevar tokens o PII; no se registra.
  return url?.split('?')[0];
}

/** Express reescribe req.url dentro de los routers; originalUrl conserva la ruta completa. */
function fullPath(req: IncomingMessage): string | undefined {
  return stripQuery((req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url);
}

/** Access log JSON: una línea por request al finalizar la respuesta. */
export const accessLog = pinoHttp<IncomingMessage, ServerResponse>({
  logger: accessLogger,
  genReqId: (req) => (req as RequestWithId).id ?? resolveRequestId(req),
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/health/ready',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${fullPath(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${fullPath(req)} ${res.statusCode}`,
  customAttributeKeys: {
    req: 'httpRequest',
    res: 'httpResponse',
    err: 'err',
    reqId: 'requestId',
    responseTime: 'durationMs',
  },
  // pino-http invoca customProps al inicio y al final: sólo se agrega userId (existe al final).
  customProps: (req) => {
    const r = req as RequestWithId;
    return r.user?.sub ? { userId: r.user.sub } : {};
  },
  serializers: {
    req: (req: { method: string; url: string; remoteAddress?: string; headers: Record<string, string | undefined> }) => ({
      method: req.method,
      path: stripQuery(req.url),
      ip: req.remoteAddress,
      userAgent: req.headers['user-agent'],
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  quietReqLogger: true,
});
