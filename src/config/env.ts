import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:4000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(800),
  RATE_LIMIT_SKIP_LOCALHOST: z.enum(['true', 'false']).optional(),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(40),
  ADMIN_EMAIL: z.string().email().default('admin@base-negocio.com'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin123!ChangeMe'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
  FRONTEND_URL: z.string().url().default('http://localhost:4000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const baseEnv = parsed.data;

export const env = {
  ...baseEnv,
  RATE_LIMIT_SKIP_LOCALHOST:
    baseEnv.RATE_LIMIT_SKIP_LOCALHOST === 'true'
      ? true
      : baseEnv.RATE_LIMIT_SKIP_LOCALHOST === 'false'
        ? false
        : baseEnv.NODE_ENV === 'development',
};

export const corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim());
