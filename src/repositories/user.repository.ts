import { Prisma, PrismaClient, Role, User } from '@prisma/client';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    role?: Role;
  }): Promise<User> {
    await this.prisma.$runCommandRaw({
      insert: 'User',
      documents: [
        {
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role ?? Role.USER,
          isActive: true,
          isBlocked: false,
          failedLoginAttempts: 0,
          loginBlockedUntil: null,
          banned_until: null,
          lastConnectionAt: null,
          createdAt: { $date: new Date().toISOString() },
          updatedAt: { $date: new Date().toISOString() },
        },
      ],
    });

    const created = await this.findByEmail(data.email);
    if (!created) {
      throw new Error('No se pudo crear el usuario');
    }

    return created;
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    const updatePayload = this.toRawUpdatePayload(data);

    await this.prisma.$runCommandRaw({
      update: 'User',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $set: {
              ...updatePayload,
              updatedAt: { $date: new Date().toISOString() },
            },
          },
          upsert: false,
          multi: false,
        },
      ],
    });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('No se pudo actualizar el usuario');
    }

    return updated;
  }

  private toRawUpdatePayload(data: Prisma.UserUpdateInput): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (typeof data.email === 'string') payload.email = data.email;
    if (typeof data.passwordHash === 'string') payload.passwordHash = data.passwordHash;
    if (typeof data.role === 'string') payload.role = data.role;
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;
    if (typeof data.isBlocked === 'boolean') payload.isBlocked = data.isBlocked;
    if (typeof data.failedLoginAttempts === 'number') payload.failedLoginAttempts = data.failedLoginAttempts;

    if (data.lastConnectionAt instanceof Date) {
      payload.lastConnectionAt = { $date: data.lastConnectionAt.toISOString() };
    }

    if (data.loginBlockedUntil instanceof Date) {
      payload.loginBlockedUntil = { $date: data.loginBlockedUntil.toISOString() };
    } else if (data.loginBlockedUntil === null) {
      payload.loginBlockedUntil = null;
    }

    if (data.bannedUntil instanceof Date) {
      payload.banned_until = { $date: data.bannedUntil.toISOString() };
    } else if (data.bannedUntil === null) {
      payload.banned_until = null;
    }

    return payload;
  }
}
