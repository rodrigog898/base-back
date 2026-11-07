import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

function packageVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- ruta fija relativa al cwd
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    SERVICE_NAME: z.string().min(1).default('base-back'),
    SERVICE_VERSION: z.string().min(1).default(packageVersion()),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

    // Criptografía de tokens (A.8.24)
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('7d'),
    JWT_ISSUER: z.string().min(1).default('base-back'),
    JWT_AUDIENCE: z.string().min(1).default('base-front'),

    // Cookie del refresh token
    REFRESH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('refresh_token'),
    COOKIE_SECURE: booleanString,
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
    COOKIE_DOMAIN: z.string().optional(),

    // Red
    CORS_ORIGINS: z.string().default('http://localhost:4000'),
    TRUST_PROXY: z.string().default('false'),
    BODY_LIMIT: z.string().default('100kb'),

    // Rate limiting
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(800),
    RATE_LIMIT_SKIP_LOCALHOST: booleanString,
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(40),

    // Política de bloqueo por fuerza bruta (A.8.5)
    AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(10),

    // Logging (A.8.15)
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_FILE: z.string().optional(),
    CLIENT_LOGS_ENABLED: booleanString,
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    const weak = /change|secret-key|example|your-/i;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (weak.test(value[key]) || value[key].length < 64) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'En producción debe ser un secreto aleatorio de al menos 64 caracteres (openssl rand -hex 48)',
        });
      }
    }
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Debe ser distinto de JWT_ACCESS_SECRET' });
    }
    if (value.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'No se permite "*" con credenciales en producción' });
    }
    if (value.COOKIE_SAMESITE === 'none' && value.COOKIE_SECURE === false) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'SameSite=None requiere Secure' });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // El logger depende de env, por eso aquí se escribe JSON directo a stderr.
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'fatal',
      service: process.env.SERVICE_NAME ?? 'base-back',
      logType: 'app',
      message: 'Variables de entorno inválidas',
      errors: z.flattenError(parsed.error).fieldErrors,
    })}\n`
  );
  process.exit(1);
}

const base = parsed.data;
const isProduction = base.NODE_ENV === 'production';

function parseTrustProxy(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // lista de IPs/subredes, p. ej. "loopback, 10.0.0.0/8"
}

export const env = {
  ...base,
  isProduction,
  TRUST_PROXY: parseTrustProxy(base.TRUST_PROXY),
  COOKIE_SECURE: base.COOKIE_SECURE ?? isProduction,
  // Nunca se omite el rate limit en producción.
  RATE_LIMIT_SKIP_LOCALHOST: isProduction ? false : (base.RATE_LIMIT_SKIP_LOCALHOST ?? base.NODE_ENV === 'development'),
  CLIENT_LOGS_ENABLED: base.CLIENT_LOGS_ENABLED ?? true,
};

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
