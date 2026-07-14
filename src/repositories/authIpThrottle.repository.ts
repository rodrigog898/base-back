import { PrismaClient } from '@prisma/client';

interface AuthIpThrottleRecord {
  ip: string;
  failedAttempts: number;
  blockedUntil: Date | null;
}

export class AuthIpThrottleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIp(ip: string): Promise<AuthIpThrottleRecord | null> {
    const raw = (await this.prisma.$runCommandRaw({
      find: 'auth_ip_throttle',
      filter: { ip },
      limit: 1,
    })) as {
      cursor?: {
        firstBatch?: Array<{
          ip: string;
          failedAttempts?: number;
          blockedUntil?: Date | { $date?: string } | null;
        }>;
      };
    };

    const row = raw.cursor?.firstBatch?.[0];
    if (!row) return null;

    return {
      ip: row.ip,
      failedAttempts: typeof row.failedAttempts === 'number' ? row.failedAttempts : 0,
      blockedUntil: this.parseDate(row.blockedUntil),
    };
  }

  async getActiveBlock(ip: string): Promise<Date | null> {
    const record = await this.findByIp(ip);
    if (!record?.blockedUntil) return null;

    const now = new Date();
    if (record.blockedUntil > now) return record.blockedUntil;

    await this.upsertState(ip, 0, null);
    return null;
  }

  async registerFailedAttempt(ip: string, maxAttempts: number, blockMinutes: number): Promise<boolean> {
    const record = await this.findByIp(ip);
    const now = new Date();

    if (!record) {
      await this.upsertState(ip, 1, null);
      return false;
    }

    if (record.blockedUntil && record.blockedUntil > now) {
      return true;
    }

    const baseAttempts = record.blockedUntil && record.blockedUntil <= now ? 0 : record.failedAttempts;
    const nextAttempts = baseAttempts + 1;

    if (nextAttempts >= maxAttempts) {
      const blockedUntil = new Date(Date.now() + blockMinutes * 60 * 1000);
      await this.upsertState(ip, 0, blockedUntil);
      return true;
    }

    await this.upsertState(ip, nextAttempts, null);
    return false;
  }

  async resetByIp(ip: string): Promise<void> {
    const record = await this.findByIp(ip);
    if (!record) return;
    await this.upsertState(ip, 0, null);
  }

  private async upsertState(ip: string, failedAttempts: number, blockedUntil: Date | null): Promise<void> {
    const nowIso = new Date().toISOString();

    await this.prisma.$runCommandRaw({
      update: 'auth_ip_throttle',
      updates: [
        {
          q: { ip },
          u: {
            $set: {
              ip,
              failedAttempts,
              blockedUntil: blockedUntil ? { $date: blockedUntil.toISOString() } : null,
              updatedAt: { $date: nowIso },
            },
            $setOnInsert: {
              createdAt: { $date: nowIso },
            },
          },
          upsert: true,
          multi: false,
        },
      ],
    });
  }

  private parseDate(value: Date | { $date?: string } | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && typeof value.$date === 'string') {
      const date = new Date(value.$date);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
}
