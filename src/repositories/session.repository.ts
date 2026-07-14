import { PrismaClient, Session } from '@prisma/client';

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<Session> {
    await this.prisma.$runCommandRaw({
      insert: 'Session',
      documents: [
        {
          userId: { $oid: data.userId },
          refreshToken: data.refreshTokenHash,
          expiresAt: { $date: data.expiresAt.toISOString() },
          createdAt: { $date: new Date().toISOString() },
        },
      ],
    });

    const created = await this.findByRefreshTokenHash(data.refreshTokenHash);
    if (!created) {
      throw new Error('No se pudo crear la sesión');
    }

    return created;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { refreshToken: refreshTokenHash } });
  }

  async deleteByRefreshTokenHash(refreshTokenHash: string): Promise<void> {
    await this.prisma.$runCommandRaw({
      delete: 'Session',
      deletes: [{ q: { refreshToken: refreshTokenHash }, limit: 0 }],
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.$runCommandRaw({
      delete: 'Session',
      deletes: [{ q: { userId: { $oid: userId } }, limit: 0 }],
    });
  }
}
