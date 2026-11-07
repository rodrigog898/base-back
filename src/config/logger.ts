import pino, { DestinationStream, Logger, LoggerOptions } from 'pino';
import { env } from './env';
import { getContext } from '../context/requestContext';

/**
 * Logger estructurado JSON (ISO/IEC 27001:2022 A.8.15 / A.8.16).
 *
 * Esquema común (ver docs/LOGGING.md, compartido con el frontend):
 *   timestamp  ISO-8601 UTC
 *   level      fatal | error | warn | info | debug | trace
 *   service    nombre del servicio
 *   version    versión desplegada
 *   environment
 *   logType    app | access | audit | client
 *   message    texto legible
 *   requestId  correlación extremo a extremo (cabecera X-Request-Id)
 *   userId     usuario autenticado (si existe)
 *   event      { category, action, outcome } para eventos de seguridad
 *   err        { type, message, stack } en errores
 *
 * Los campos sensibles se reemplazan por "[REDACTED]" antes de escribirse.
 */

export type LogType = 'app' | 'access' | 'audit' | 'client';

const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
  'apiKey',
];

export const REDACT_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_KEYS.map((key) => `*.*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

interface BuildOptions {
  logType: LogType;
  /** Agrega requestId/userId desde AsyncLocalStorage. */
  withContext?: boolean;
}

export function buildLoggerOptions({ logType, withContext = true }: BuildOptions): LoggerOptions {
  return {
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    messageKey: 'message',
    errorKey: 'err',
    base: {
      service: env.SERVICE_NAME,
      version: env.SERVICE_VERSION,
      environment: env.NODE_ENV,
      logType,
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...(withContext
      ? {
          mixin() {
            const ctx = getContext();
            if (!ctx) return {};
            return ctx.userId ? { requestId: ctx.requestId, userId: ctx.userId } : { requestId: ctx.requestId };
          },
        }
      : {}),
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };
}

export function createDestination(): DestinationStream {
  if (env.LOG_FILE) {
    // stdout + archivo (la rotación/retención se delega a logrotate o al agente de logs)
    return pino.multistream([
      { stream: pino.destination(1) },
      { stream: pino.destination({ dest: env.LOG_FILE, mkdir: true }) },
    ]);
  }
  return pino.destination(1);
}

export function createLogger(options: BuildOptions, destination: DestinationStream): Logger {
  return pino(buildLoggerOptions(options), destination);
}

const destination = createDestination();

/** Logs de aplicación. */
export const logger = createLogger({ logType: 'app' }, destination);

/** Logs de acceso HTTP (uno por request). El contexto lo aporta pino-http. */
export const accessLogger = createLogger({ logType: 'access', withContext: false }, destination);

/** Auditoría de seguridad: autenticación, autorización, cambios de sesión. */
export const auditLogger = createLogger({ logType: 'audit' }, destination);

/** Errores reportados por el frontend. */
export const clientLogger = createLogger({ logType: 'client' }, destination);

/** Enmascara un email para minimizar datos personales en logs (A.5.34). */
export function maskEmail(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
