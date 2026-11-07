import { prisma } from './config/prisma';
import { UserRepository } from './repositories/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { AuthSecurityLogRepository } from './repositories/authSecurityLog.repository';
import { AuthIpThrottleRepository } from './repositories/authIpThrottle.repository';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { createAuthenticate } from './middlewares/auth.middleware';

const userRepository = new UserRepository(prisma);
const sessionRepository = new SessionRepository(prisma);
const authSecurityLogRepository = new AuthSecurityLogRepository(prisma);
const authIpThrottleRepository = new AuthIpThrottleRepository(prisma);

export const auditService = new AuditService(authSecurityLogRepository);

const authService = new AuthService(userRepository, sessionRepository, authIpThrottleRepository, auditService);

export const authController = new AuthController(authService);
export const authenticate = createAuthenticate(userRepository);
