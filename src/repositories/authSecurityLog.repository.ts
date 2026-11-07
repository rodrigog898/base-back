import { PrismaClient } from '@prisma/client';

export type SecurityEvent =
  | 'REGISTER'
  | 'LOGIN_SUCCESS'
  | 'FAILED_LOGIN'
  | 'TEMP_BLOCKED'
  | 'BLOCKED_ATTEMPT'
  | 'ACCOUNT_DISABLED_ATTEMPT'
  | 'FAILED_LOGIN_IP'
  | 'TEMP_BLOCKED_IP'
  | 'BLOCKED_IP_ATTEMPT'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REUSE_DETECTED'
  | 'LOGOUT'
  | 'LOGOUT_ALL';

export interface CreateAuthSecurityLogInput {
  email: string;
  event: SecurityEvent;
  outcome: 'success' | 'failure';
  description: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Repositorio append-only: no expone update ni delete. */
export class AuthSecurityLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthSecurityLogInput): Promise<void> {
    await this.prisma.$runCommandRaw({
      insert: 'auth_security_log',
      documents: [
        {
          email: input.email,
          event: input.event,
          outcome: input.outcome,
          description: input.description,
          userId: input.userId ? { $oid: input.userId } : null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          createdAt: { $date: new Date().toISOString() },
        },
      ],
    });
  }
}
