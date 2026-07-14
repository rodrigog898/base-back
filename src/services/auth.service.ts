import { Role } from '@prisma/client';
import { UserRepository } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { comparePassword, hashPassword } from '../utils/bcrypt';
import {
  getRefreshTokenExpiry,
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { toSafeUser } from '../utils/userMapper';
import { ConflictError, ForbiddenError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { SafeUser, TokenPair } from '../types';
import { LoginInput, RegisterInput } from '../schemas';
import { logger } from '../config/logger';
import { AuthSecurityLogRepository } from '../repositories/authSecurityLog.repository';
import { AuthIpThrottleRepository } from '../repositories/authIpThrottle.repository';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MAX_FAILED_IP_ATTEMPTS = 5;
const BRUTE_FORCE_BLOCK_MINUTES = 10;

type UserSecurityFields = {
  isActive?: boolean;
  isBlocked?: boolean;
  loginBlockedUntil?: Date | null;
  bannedUntil?: Date | null;
  failedLoginAttempts?: number;
};

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly authSecurityLogRepository: AuthSecurityLogRepository,
    private readonly authIpThrottleRepository: AuthIpThrottleRepository
  ) {}

  async register(input: RegisterInput): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('El correo ya está registrado');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
    });

    const tokens = await this.createSession(user.id, user.email, user.role);
    const connectedUser = await this.markUserConnected(user.id);

    logger.info('User registered', { userId: user.id, email: user.email });

    return { user: toSafeUser(connectedUser), tokens };
  }

  async login(
    input: LoginInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const normalizedIp = this.normalizeIp(context?.ip);
    const shouldTrackIp = normalizedIp ? !this.isLocalhostIp(normalizedIp) : false;
    const normalizedContext = {
      ip: normalizedIp,
      userAgent: context?.userAgent,
    };

    if (normalizedIp && shouldTrackIp) {
      const blockedUntil = await this.authIpThrottleRepository.getActiveBlock(normalizedIp);
      if (blockedUntil) {
        await this.authSecurityLogRepository.create({
          email: input.email,
          event: 'BLOCKED_IP_ATTEMPT',
          description: `Blocked login attempt from throttled IP until ${blockedUntil.toISOString()}`,
          ip: normalizedIp,
          userAgent: context?.userAgent,
        });
        throw new ForbiddenError('Demasiados intentos fallidos. Intenta nuevamente en 10 minutos.');
      }
    }

    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      const ipBlocked = shouldTrackIp
        ? await this.handleFailedIpAttempt(input.email, normalizedContext)
        : false;
      if (ipBlocked) {
        throw new ForbiddenError('Demasiados intentos fallidos. Intenta nuevamente en 10 minutos.');
      }
      throw new UnauthorizedError('Credenciales inválidas');
    }
    const securedUser = user as typeof user & UserSecurityFields;

    if (securedUser.isActive === false) {
      throw new ForbiddenError('Este usuario está desactivado');
    }

    if (securedUser.isBlocked === true) {
      throw new ForbiddenError('Este usuario está bloqueado');
    }

    if (securedUser.bannedUntil && securedUser.bannedUntil > new Date()) {
      throw new ForbiddenError('Este usuario está suspendido temporalmente');
    }

    if (securedUser.loginBlockedUntil && securedUser.loginBlockedUntil > new Date()) {
      await this.authSecurityLogRepository.create({
        email: user.email,
        userId: user.id,
        event: 'BLOCKED_ATTEMPT',
        description: 'Blocked login attempt while temporary restriction is active',
        ip: normalizedContext.ip,
        userAgent: normalizedContext.userAgent,
      });
      throw new ForbiddenError('Demasiados intentos fallidos. Intenta nuevamente en 10 minutos.');
    }

    const isValid = await comparePassword(input.password, user.passwordHash);
    if (!isValid) {
      const isTemporarilyBlocked = await this.handleFailedLogin(
        user.id,
        user.email,
        securedUser.failedLoginAttempts ?? 0,
        normalizedContext
      );
      const ipBlocked = shouldTrackIp
        ? await this.handleFailedIpAttempt(user.email, normalizedContext)
        : false;
      if (isTemporarilyBlocked || ipBlocked) {
        throw new ForbiddenError('Demasiados intentos fallidos. Intenta nuevamente en 10 minutos.');
      }
      throw new UnauthorizedError('Credenciales inválidas');
    }

    await this.resetFailedLoginState(user.id);
    if (normalizedIp && shouldTrackIp) {
      await this.authIpThrottleRepository.resetByIp(normalizedIp);
    }
    const tokens = await this.createSession(user.id, user.email, user.role);
    const connectedUser = await this.markUserConnected(user.id);

    logger.info('User logged in', { userId: user.id });

    return { user: toSafeUser(connectedUser), tokens };
  }

  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    const securedUser = user as typeof user & UserSecurityFields;
    if (securedUser.isActive === false || securedUser.isBlocked === true) {
      throw new UnauthorizedError('El usuario no tiene permitido iniciar sesión');
    }

    if (securedUser.bannedUntil && securedUser.bannedUntil > new Date()) {
      throw new UnauthorizedError('El usuario no tiene permitido iniciar sesión');
    }

    return toSafeUser(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Token de actualización inválido o expirado');
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.sessionRepository.findByRefreshTokenHash(refreshTokenHash);
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Token de actualización inválido o expirado');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }
    const securedUser = user as typeof user & UserSecurityFields;

    if (securedUser.isActive === false || securedUser.isBlocked === true) {
      throw new UnauthorizedError('El usuario no tiene permitido iniciar sesión');
    }

    if (securedUser.bannedUntil && securedUser.bannedUntil > new Date()) {
      throw new UnauthorizedError('El usuario no tiene permitido iniciar sesión');
    }

    await this.sessionRepository.deleteByRefreshTokenHash(refreshTokenHash);

    const tokens = await this.createSession(user.id, user.email, user.role);
    await this.markUserConnected(user.id);
    return tokens;
  }

  private async createSession(userId: string, email: string, role: Role): Promise<TokenPair> {
    const payload = { sub: userId, email, role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = getRefreshTokenExpiry();

    await this.sessionRepository.create({ userId, refreshTokenHash, expiresAt });

    return { accessToken, refreshToken };
  }

  private async markUserConnected(userId: string) {
    return this.userRepository.update(userId, { lastConnectionAt: new Date() });
  }

  private async resetFailedLoginState(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      failedLoginAttempts: 0,
      loginBlockedUntil: null,
    });
  }

  private async handleFailedLogin(
    userId: string,
    email: string,
    currentAttempts: number,
    context?: { ip?: string; userAgent?: string }
  ): Promise<boolean> {
    const nextAttempts = currentAttempts + 1;

    if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + BRUTE_FORCE_BLOCK_MINUTES * 60 * 1000);
      await this.userRepository.update(userId, {
        failedLoginAttempts: 0,
        loginBlockedUntil: blockedUntil,
      });

      await this.authSecurityLogRepository.create({
        email,
        userId,
        event: 'TEMP_BLOCKED',
        description: `Temporary account restriction for ${BRUTE_FORCE_BLOCK_MINUTES} minutes after repeated failed login attempts`,
        ip: context?.ip,
        userAgent: context?.userAgent,
      });

      return true;
    }

    await this.userRepository.update(userId, { failedLoginAttempts: nextAttempts });
    await this.authSecurityLogRepository.create({
      email,
      userId,
      event: 'FAILED_LOGIN',
      description: `Failed login attempt #${nextAttempts}`,
      ip: context?.ip,
      userAgent: context?.userAgent,
    });
    return false;
  }

  private async handleFailedIpAttempt(email: string, context?: { ip?: string; userAgent?: string }): Promise<boolean> {
    if (!context?.ip) return false;

    const isBlocked = await this.authIpThrottleRepository.registerFailedAttempt(
      context.ip,
      MAX_FAILED_IP_ATTEMPTS,
      BRUTE_FORCE_BLOCK_MINUTES
    );

    await this.authSecurityLogRepository.create({
      email,
      event: isBlocked ? 'TEMP_BLOCKED_IP' : 'FAILED_LOGIN_IP',
      description: isBlocked
        ? `IP restricted for ${BRUTE_FORCE_BLOCK_MINUTES} minutes due to repeated failed login attempts`
        : 'Failed login attempt tracked by IP throttling',
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return isBlocked;
  }

  private normalizeIp(ip?: string): string | undefined {
    const value = ip?.trim();
    if (!value) return undefined;
    return value;
  }

  private isLocalhostIp(ip: string): boolean {
    return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
  }
}
