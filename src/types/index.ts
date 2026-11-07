import { Role } from '@prisma/client';

/** El access token no incluye datos personales (email): sólo identificador y rol. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
  jti: string;
}

export interface AuthenticatedUser {
  sub: string;
  role: Role;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  isBlocked: boolean;
  lastConnectionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
