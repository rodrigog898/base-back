import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config({ quiet: true });

// Mismo esquema JSON que la aplicación (docs/LOGGING.md).
const log = pino({
  messageKey: 'message',
  base: { service: `${process.env.SERVICE_NAME ?? 'base-back'}-seed`, environment: process.env.NODE_ENV ?? 'development', logType: 'app' },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: { level: (label) => ({ level: label }) },
});

const prisma = new PrismaClient();

function requireAdminCredentials(): { email: string; password: string } {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL y ADMIN_PASSWORD son obligatorias para el seed');
  }
  if (password.length < 12 || /changeme/i.test(password)) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres y no ser el valor de ejemplo');
  }
  return { email: email.trim().toLowerCase(), password };
}

async function main(): Promise<void> {
  const { email, password } = requireAdminCredentials();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    log.info({ userId: existing.id }, 'Admin already exists');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = { $date: new Date().toISOString() };

  await prisma.$runCommandRaw({
    insert: 'User',
    documents: [
      {
        email,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        isBlocked: false,
        failedLoginAttempts: 0,
        loginBlockedUntil: null,
        banned_until: null,
        lastConnectionAt: null,
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) throw new Error('No se pudo crear el admin');

  log.info({ userId: admin.id, role: admin.role }, 'Admin created. Change the password after first login.');
}

main()
  .catch((err: unknown) => {
    log.fatal({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
