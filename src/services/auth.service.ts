import { Role, User } from '@prisma/client';
import { UserRepository } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { AuthIpThrottleRepository } from '../repositories/authIpThrottle.repository';
import { comparePassword, hashPassword, verifyDummyPassword } from '../utils/bcrypt';
import {
  durationToMs,
  getRefreshTokenExpiry,
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { toSafeUser } from '../utils/userMapper';
import { ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError } from '../utils/errors';
import { AuthResult, RequestMeta, SafeUser } from '../types';
import { LoginInput, RegisterInput } from '../schemas';
import { env } from '../config/env';
import { isLocalhostIp } from '../utils/network';
import { AuditService } from './audit.service';

const INVALID_CREDENTIALS = 'Credenciales inválidas';
const INVALID_REFRESH = 'Sesión inválida o expirada';

/** Usuario habilitado para operar: activo, no bloqueado y sin suspensión vigente. */
export function isUserAccessAllowed(user: Pick<User, 'isActive' | 'isBlocked' | 'bannedUntil'>): boolean {
  if (user.isActive === false || user.isBlocked === true) return false;
  if (user.bannedUntil && user.bannedUntil > new Date()) return false;
  return true;
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly ipThrottleRepository: AuthIpThrottleRepository,
    private readonly audit: AuditService
  ) {}

  private get lockoutMessage(): string {
    return `Demasiados intentos fallidos. Intenta nuevamente en ${env.AUTH_LOCKOUT_MINUTES} minutos.`;
  }

  async register(input: RegisterInput, meta: RequestMeta = {}): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('El correo ya está registrado', 'EMAIL_ALREADY_REGISTERED');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.userRepository.create({ email: input.email, passwordHash });

    await this.audit.record({
      event: 'REGISTER',
      outcome: 'success',
      description: 'User registered',
      email: user.email,
      userId: user.id,
      meta,
    });

    return this.issueSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta = {}): Promise<AuthResult> {
    const trackIp = Boolean(meta.ip) && !isLocalhostIp(meta.ip);

    // 1. Bloqueo por IP
    if (trackIp && meta.ip) {
      const blockedUntil = await this.ipThrottleRepository.getActiveBlock(meta.ip);
      if (blockedUntil) {
        await this.audit.record({
          event: 'BLOCKED_IP_ATTEMPT',
          outcome: 'failure',
          description: `Login attempt from throttled IP (blocked until ${blockedUntil.toISOString()})`,
          email: input.email,
          meta,
        });
        throw new TooManyRequestsError(this.lockoutMessage, 'IP_TEMPORARILY_BLOCKED');
      }
    }

    // 2. Usuario inexistente: se ejecuta bcrypt igual para no filtrar existencia por tiempo de respuesta.
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      await verifyDummyPassword(input.password);
      await this.failIp(input.email, meta, trackIp);
      throw new UnauthorizedError(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    // 3. Bloqueo temporal de la cuenta por fuerza bruta
    if (user.loginBlockedUntil && user.loginBlockedUntil > new Date()) {
      await this.audit.record({
        event: 'BLOCKED_ATTEMPT',
        outcome: 'failure',
        description: 'Login attempt while temporary account lockout is active',
        email: user.email,
        userId: user.id,
        meta,
      });
      throw new TooManyRequestsError(this.lockoutMessage, 'ACCOUNT_TEMPORARILY_LOCKED');
    }

    // 4. Contraseña (antes de revelar cualquier estado de la cuenta)
    const isValid = await comparePassword(input.password, user.passwordHash);
    if (!isValid) {
      const accountLocked = await this.failAccount(user, meta);
      const ipLocked = await this.failIp(user.email, meta, trackIp);
      if (accountLocked || ipLocked) throw new TooManyRequestsError(this.lockoutMessage, 'ACCOUNT_TEMPORARILY_LOCKED');
      throw new UnauthorizedError(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    // 5. Estado de la cuenta (sólo tras credenciales correctas, mensaje genérico)
    if (!isUserAccessAllowed(user)) {
      await this.audit.record({
        event: 'ACCOUNT_DISABLED_ATTEMPT',
        outcome: 'failure',
        description: 'Valid credentials for inactive, blocked or suspended account',
        email: user.email,
        userId: user.id,
        meta,
      });
      throw new ForbiddenError('La cuenta no está habilitada. Contacta al administrador.', 'ACCOUNT_DISABLED');
    }

    await this.userRepository.update(user.id, { failedLoginAttempts: 0, loginBlockedUntil: null });
    if (trackIp && meta.ip) await this.ipThrottleRepository.resetByIp(meta.ip);

    await this.audit.record({
      event: 'LOGIN_SUCCESS',
      outcome: 'success',
      description: 'User logged in',
      email: user.email,
      userId: user.id,
      meta,
    });

    return this.issueSession(user, meta);
  }

  /**
   * Rotación de refresh token con detección de reutilización (OWASP ASVS 3.5 / RFC 9700):
   * si llega un refresh token con firma válida pero cuya sesión ya no existe,
   * se asume robo y se revocan todas las sesiones del usuario.
   */
  async refresh(refreshToken: string | undefined, meta: RequestMeta = {}): Promise<AuthResult> {
    if (!refreshToken) throw new UnauthorizedError(INVALID_REFRESH, 'REFRESH_TOKEN_REQUIRED');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError(INVALID_REFRESH, 'INVALID_REFRESH_TOKEN');
    }

    const hash = hashRefreshToken(refreshToken);
    const session = await this.sessionRepository.findByRefreshTokenHash(hash);
    const user = await this.userRepository.findById(payload.sub);

    if (!session) {
      if (user) {
        const revoked = await this.sessionRepository.deleteByUserId(user.id);
        await this.audit.record({
          event: 'TOKEN_REUSE_DETECTED',
          outcome: 'failure',
          description: `Refresh token reuse detected; ${revoked} session(s) revoked`,
          email: user.email,
          userId: user.id,
          meta,
        });
      }
      throw new UnauthorizedError(INVALID_REFRESH, 'INVALID_REFRESH_TOKEN');
    }

    // Consumir la sesión de forma atómica: si dos requests compiten, sólo una gana.
    const consumed = await this.sessionRepository.deleteByRefreshTokenHash(hash);
    if (!consumed || session.expiresAt < new Date() || session.userId !== payload.sub) {
      throw new UnauthorizedError(INVALID_REFRESH, 'INVALID_REFRESH_TOKEN');
    }

    if (!user || !isUserAccessAllowed(user)) {
      throw new UnauthorizedError(INVALID_REFRESH, 'INVALID_REFRESH_TOKEN');
    }

    await this.audit.record({
      event: 'TOKEN_REFRESH',
      outcome: 'success',
      description: 'Refresh token rotated',
      email: user.email,
      userId: user.id,
      meta,
    });

    return this.issueSession(user, meta, { markConnected: false });
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta = {}): Promise<void> {
    if (!refreshToken) return;

    const hash = hashRefreshToken(refreshToken);
    const session = await this.sessionRepository.findByRefreshTokenHash(hash);
    if (!session) return;

    await this.sessionRepository.deleteByRefreshTokenHash(hash);
    const user = await this.userRepository.findById(session.userId);
    await this.audit.record({
      event: 'LOGOUT',
      outcome: 'success',
      description: 'Session closed',
      email: user?.email ?? 'unknown',
      userId: session.userId,
      meta,
    });
  }

  async logoutAll(userId: string, meta: RequestMeta = {}): Promise<number> {
    const user = await this.userRepository.findById(userId);
    const revoked = await this.sessionRepository.deleteByUserId(userId);
    await this.audit.record({
      event: 'LOGOUT_ALL',
      outcome: 'success',
      description: `All sessions revoked (${revoked})`,
      email: user?.email ?? 'unknown',
      userId,
      meta,
    });
    return revoked;
  }

  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    if (!isUserAccessAllowed(user)) throw new UnauthorizedError('Sesión inválida', 'ACCOUNT_DISABLED');
    return toSafeUser(user);
  }

  private async issueSession(
    user: User,
    meta: RequestMeta,
    options: { markConnected?: boolean } = {}
  ): Promise<AuthResult> {
    const accessToken = signAccessToken({ sub: user.id, role: user.role as Role });
    const refreshToken = signRefreshToken(user.id);

    await this.sessionRepository.deleteExpiredForUser(user.id);
    await this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiry(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const current =
      options.markConnected === false ? user : await this.userRepository.update(user.id, { lastConnectionAt: new Date() });

    return {
      user: toSafeUser(current),
      accessToken,
      accessTokenExpiresIn: Math.floor(durationToMs(env.JWT_ACCESS_EXPIRES_IN) / 1000),
      refreshToken,
    };
  }

  /** @returns true si la cuenta quedó bloqueada temporalmente */
  private async failAccount(user: User, meta: RequestMeta): Promise<boolean> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;

    if (attempts >= env.AUTH_MAX_FAILED_ATTEMPTS) {
      await this.userRepository.update(user.id, {
        failedLoginAttempts: 0,
        loginBlockedUntil: new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60_000),
      });
      await this.audit.record({
        event: 'TEMP_BLOCKED',
        outcome: 'failure',
        description: `Account locked for ${env.AUTH_LOCKOUT_MINUTES} minutes after ${attempts} failed attempts`,
        email: user.email,
        userId: user.id,
        meta,
      });
      return true;
    }

    await this.userRepository.update(user.id, { failedLoginAttempts: attempts });
    await this.audit.record({
      event: 'FAILED_LOGIN',
      outcome: 'failure',
      description: `Failed login attempt #${attempts}`,
      email: user.email,
      userId: user.id,
      meta,
    });
    return false;
  }

  /** @returns true si la IP quedó bloqueada temporalmente */
  private async failIp(email: string, meta: RequestMeta, trackIp: boolean): Promise<boolean> {
    if (!trackIp || !meta.ip) return false;

    const blocked = await this.ipThrottleRepository.registerFailedAttempt(
      meta.ip,
      env.AUTH_MAX_FAILED_ATTEMPTS,
      env.AUTH_LOCKOUT_MINUTES
    );

    await this.audit.record({
      event: blocked ? 'TEMP_BLOCKED_IP' : 'FAILED_LOGIN_IP',
      outcome: 'failure',
      description: blocked
        ? `IP locked for ${env.AUTH_LOCKOUT_MINUTES} minutes after repeated failed attempts`
        : 'Failed login attempt tracked by IP',
      email,
      meta,
    });
    return blocked;
  }
}
