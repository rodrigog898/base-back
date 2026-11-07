import { auditLogger, logger, maskEmail } from '../config/logger';
import { getContext } from '../context/requestContext';
import { AuthSecurityLogRepository, SecurityEvent } from '../repositories/authSecurityLog.repository';
import { RequestMeta } from '../types';

export interface AuditEntry {
  event: SecurityEvent;
  outcome: 'success' | 'failure';
  description: string;
  email: string;
  userId?: string;
  meta?: RequestMeta;
}

const ACTIONS: Record<SecurityEvent, string> = {
  REGISTER: 'user-register',
  LOGIN_SUCCESS: 'login',
  FAILED_LOGIN: 'login',
  TEMP_BLOCKED: 'account-lockout',
  BLOCKED_ATTEMPT: 'login',
  ACCOUNT_DISABLED_ATTEMPT: 'login',
  FAILED_LOGIN_IP: 'login',
  TEMP_BLOCKED_IP: 'ip-lockout',
  BLOCKED_IP_ATTEMPT: 'login',
  TOKEN_REFRESH: 'token-refresh',
  TOKEN_REUSE_DETECTED: 'token-reuse',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout-all',
};

/**
 * Registro de auditoría de seguridad (A.8.15):
 *  - línea JSON con logType=audit para el SIEM (email enmascarado)
 *  - documento persistente en auth_security_log para investigación
 * Un fallo al persistir nunca interrumpe el flujo de autenticación, pero queda registrado.
 */
export class AuditService {
  constructor(private readonly repository: AuthSecurityLogRepository) {}

  async record(entry: AuditEntry): Promise<void> {
    const requestId = getContext()?.requestId;
    const level = entry.event === 'TOKEN_REUSE_DETECTED' || entry.event.startsWith('TEMP_BLOCKED') ? 'warn' : 'info';

    auditLogger[level](
      {
        event: { category: 'authentication', action: ACTIONS[entry.event], type: entry.event, outcome: entry.outcome },
        userId: entry.userId,
        email: maskEmail(entry.email),
        ip: entry.meta?.ip,
        userAgent: entry.meta?.userAgent,
      },
      entry.description
    );

    try {
      await this.repository.create({
        email: entry.email,
        event: entry.event,
        outcome: entry.outcome,
        description: entry.description,
        userId: entry.userId,
        ip: entry.meta?.ip,
        userAgent: entry.meta?.userAgent,
        requestId,
      });
    } catch (err) {
      logger.error({ err, auditEvent: entry.event }, 'Failed to persist audit event');
    }
  }
}
