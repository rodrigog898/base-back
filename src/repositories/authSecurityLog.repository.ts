import { PrismaClient } from '@prisma/client';

export interface CreateAuthSecurityLogInput {
  email: string;
  event: 'FAILED_LOGIN' | 'TEMP_BLOCKED' | 'BLOCKED_ATTEMPT' | 'FAILED_LOGIN_IP' | 'TEMP_BLOCKED_IP' | 'BLOCKED_IP_ATTEMPT';
  description: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export class AuthSecurityLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthSecurityLogInput): Promise<void> {
    await this.prisma.$runCommandRaw({
      insert: 'auth_security_log',
      documents: [
        {
          email: input.email,
          event: input.event,
          description: input.description,
          userId: input.userId ? { $oid: input.userId } : null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          createdAt: { $date: new Date().toISOString() },
        },
      ],
    });
  }
}
