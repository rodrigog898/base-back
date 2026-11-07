import { PrismaClient, Session } from '@prisma/client';

/**
 * Las escrituras usan $runCommandRaw para funcionar con MongoDB standalone
 * (Prisma exige replica set para create/update con transacciones implícitas).
 */
export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    const now = { $date: new Date().toISOString() };
    await this.prisma.$runCommandRaw({
      insert: 'Session',
      documents: [
        {
          userId: { $oid: data.userId },
          refreshToken: data.refreshTokenHash,
          expiresAt: { $date: data.expiresAt.toISOString() },
          ip: data.ip ?? null,
          userAgent: data.userAgent ?? null,
          lastUsedAt: now,
          createdAt: now,
        },
      ],
    });
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { refreshToken: refreshTokenHash } });
  }

  /** Borra la sesión y devuelve true sólo si existía (evita carreras en la rotación). */
  async deleteByRefreshTokenHash(refreshTokenHash: string): Promise<boolean> {
    const result = (await this.prisma.$runCommandRaw({
      delete: 'Session',
      deletes: [{ q: { refreshToken: refreshTokenHash }, limit: 1 }],
    })) as { n?: number };
    return (result.n ?? 0) > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = (await this.prisma.$runCommandRaw({
      delete: 'Session',
      deletes: [{ q: { userId: { $oid: userId } }, limit: 0 }],
    })) as { n?: number };
    return result.n ?? 0;
  }

  async deleteExpiredForUser(userId: string): Promise<void> {
    await this.prisma.$runCommandRaw({
      delete: 'Session',
      deletes: [{ q: { userId: { $oid: userId }, expiresAt: { $lt: { $date: new Date().toISOString() } } }, limit: 0 }],
    });
  }
}
