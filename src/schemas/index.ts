import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Formato de correo inválido'));

/**
 * Política de contraseñas (A.5.17): mínimo 12 caracteres, mayúscula, minúscula y número.
 * bcrypt sólo considera los primeros 72 bytes, por eso se limita la longitud en bytes.
 */
const password = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'La contraseña es demasiado larga')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número');

export const registerSchema = z.strictObject({
  email,
  password,
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});

const clientLogEntry = z.strictObject({
  level: z.enum(['error', 'warn', 'info']),
  message: z.string().min(1).max(1000),
  timestamp: z.iso.datetime().optional(),
  requestId: z.string().regex(/^[A-Za-z0-9._-]{8,128}$/).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  context: z
    .record(z.string().max(64), z.unknown())
    .optional()
    .refine((value) => value === undefined || JSON.stringify(value).length <= 4000, 'context demasiado grande'),
});

export const clientLogsSchema = z.strictObject({
  logs: z.array(clientLogEntry).min(1).max(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ClientLogsInput = z.infer<typeof clientLogsSchema>;
