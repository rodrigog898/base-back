import { prisma } from './config/prisma';
import { UserRepository } from './repositories/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { AuthSecurityLogRepository } from './repositories/authSecurityLog.repository';
import { AuthIpThrottleRepository } from './repositories/authIpThrottle.repository';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';

const userRepository = new UserRepository(prisma);
const sessionRepository = new SessionRepository(prisma);
const authSecurityLogRepository = new AuthSecurityLogRepository(prisma);
const authIpThrottleRepository = new AuthIpThrottleRepository(prisma);

const authService = new AuthService(
  userRepository,
  sessionRepository,
  authSecurityLogRepository,
  authIpThrottleRepository
);

export const authController = new AuthController(authService);
