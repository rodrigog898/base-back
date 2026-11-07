import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  const dbLogger = logger.child({ component: 'prisma' });

  // Las queries sólo se registran en nivel debug y sin parámetros (pueden contener datos personales).
  client.$on('query', (e) => dbLogger.debug({ db: { query: e.query, durationMs: e.duration } }, 'db query'));
  client.$on('info', (e) => dbLogger.info({ db: { target: e.target } }, e.message));
  client.$on('warn', (e) => dbLogger.warn({ db: { target: e.target } }, e.message));
  client.$on('error', (e) => dbLogger.error({ db: { target: e.target } }, e.message));

  return client;
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: AppPrismaClient | undefined };

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info({ component: 'prisma' }, 'Database connected');
  } catch (err) {
    logger.error({ component: 'prisma', err }, 'Failed to connect to database');
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info({ component: 'prisma' }, 'Database disconnected');
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
