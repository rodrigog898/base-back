import { describe, expect, it, beforeEach } from 'vitest';
import { Role, User } from '@prisma/client';
import { AuthService } from '../src/services/auth.service';
import { hashPassword } from '../src/utils/bcrypt';
import { hashRefreshToken, signRefreshToken, verifyAccessToken } from '../src/utils/tokens';

/** Repositorios en memoria: prueban la lógica de seguridad sin MongoDB. */
function setup() {
  const users = new Map<string, User>();
  const sessions = new Map<string, { userId: string; refreshToken: string; expiresAt: Date }>();
  const audit: string[] = [];

  const userRepository = {
    findByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    findById: async (id: string) => users.get(id) ?? null,
    create: async ({ email, passwordHash }: { email: string; passwordHash: string }) => {
      const user = {
        id: `u${users.size + 1}`,
        email,
        passwordHash,
        role: Role.USER,
        isActive: true,
        isBlocked: false,
        failedLoginAttempts: 0,
        loginBlockedUntil: null,
        bannedUntil: null,
        lastConnectionAt: null,
        passwordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
      users.set(user.id, user);
      return user;
    },
    update: async (id: string, data: Partial<User>) => {
      const user = { ...users.get(id)!, ...data } as User;
      users.set(id, user);
      return user;
    },
  };

  const sessionRepository = {
    create: async (d: { userId: string; refreshTokenHash: string; expiresAt: Date }) => {
      sessions.set(d.refreshTokenHash, { userId: d.userId, refreshToken: d.refreshTokenHash, expiresAt: d.expiresAt });
    },
    findByRefreshTokenHash: async (h: string) => sessions.get(h) ?? null,
    deleteByRefreshTokenHash: async (h: string) => sessions.delete(h),
    deleteByUserId: async (userId: string) => {
      let n = 0;
      for (const [k, s] of sessions) if (s.userId === userId && sessions.delete(k)) n++;
      return n;
    },
    deleteExpiredForUser: async () => undefined,
  };

  const ipThrottleRepository = {
    getActiveBlock: async () => null,
    registerFailedAttempt: async () => false,
    resetByIp: async () => undefined,
  };

  const auditService = { record: async (e: { event: string }) => void audit.push(e.event) };

  const service = new AuthService(
    userRepository as any,
    sessionRepository as any,
    ipThrottleRepository as any,
    auditService as any
  );

  return { service, users, sessions, audit };
}

const PASSWORD = 'Contrasena-Segura1';

describe('AuthService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.service.register({ email: 'ana@empresa.cl', password: PASSWORD });
  });

  it('login exitoso emite access token sin email (minimización de PII)', async () => {
    const result = await ctx.service.login({ email: 'ana@empresa.cl', password: PASSWORD });
    const payload = verifyAccessToken(result.accessToken) as unknown as Record<string, unknown>;
    expect(payload.email).toBeUndefined();
    expect(payload.typ).toBe('access');
    expect(ctx.audit).toContain('LOGIN_SUCCESS');
  });

  it('mismo error para usuario inexistente y contraseña incorrecta', async () => {
    const a = await ctx.service.login({ email: 'nadie@empresa.cl', password: 'x' }).catch((e) => e);
    const b = await ctx.service.login({ email: 'ana@empresa.cl', password: 'incorrecta' }).catch((e) => e);
    expect(a.message).toBe(b.message);
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
  });

  it('no revela que la cuenta está bloqueada sin la contraseña correcta', async () => {
    const user = [...ctx.users.values()][0]!;
    ctx.users.set(user.id, { ...user, isBlocked: true });
    const wrong = await ctx.service.login({ email: 'ana@empresa.cl', password: 'incorrecta' }).catch((e) => e);
    expect(wrong.statusCode).toBe(401);
    const right = await ctx.service.login({ email: 'ana@empresa.cl', password: PASSWORD }).catch((e) => e);
    expect(right.statusCode).toBe(403);
  });

  it('bloquea la cuenta tras N intentos fallidos', async () => {
    let last: any;
    for (let i = 0; i < 5; i++) {
      last = await ctx.service.login({ email: 'ana@empresa.cl', password: 'incorrecta' }).catch((e) => e);
    }
    expect(last.statusCode).toBe(429);
    expect(ctx.audit).toContain('TEMP_BLOCKED');
    const after = await ctx.service.login({ email: 'ana@empresa.cl', password: PASSWORD }).catch((e) => e);
    expect(after.statusCode).toBe(429);
  });

  it('rota el refresh token y detecta reutilización revocando todas las sesiones', async () => {
    const login = await ctx.service.login({ email: 'ana@empresa.cl', password: PASSWORD });
    const rotated = await ctx.service.refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(ctx.sessions.has(hashRefreshToken(rotated.refreshToken))).toBe(true);

    // Reutilización del token antiguo
    const reuse = await ctx.service.refresh(login.refreshToken).catch((e) => e);
    expect(reuse.statusCode).toBe(401);
    expect(ctx.audit).toContain('TOKEN_REUSE_DETECTED');
    expect(ctx.sessions.has(hashRefreshToken(rotated.refreshToken))).toBe(false);
  });

  it('refresh tokens emitidos en el mismo segundo son distintos (jti)', () => {
    expect(signRefreshToken('u1')).not.toBe(signRefreshToken('u1'));
  });

  it('logout revoca la sesión', async () => {
    const login = await ctx.service.login({ email: 'ana@empresa.cl', password: PASSWORD });
    await ctx.service.logout(login.refreshToken);
    const res = await ctx.service.refresh(login.refreshToken).catch((e) => e);
    expect(res.statusCode).toBe(401);
  });

  it('las contraseñas se guardan con bcrypt', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});
