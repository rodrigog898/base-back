import { Router } from 'express';
import { authController, authenticate } from '../container';
import { validate } from '../middlewares/validate.middleware';
import { authRateLimiter } from '../middlewares/rateLimit.middleware';
import { requireTrustedOrigin } from '../middlewares/security.middleware';
import { loginSchema, registerSchema } from '../schemas';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
// Endpoints basados en cookie: exigen Origin de confianza (CSRF).
router.post('/refresh', authRateLimiter, requireTrustedOrigin, authController.refresh);
router.post('/logout', requireTrustedOrigin, authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.get('/me', authenticate, authController.me);

export default router;
