import { Router } from 'express';
import { env } from '../config/env';
import { pingDatabase } from '../config/prisma';
import authRoutes from './auth.routes';
import clientLogsRoutes from './clientLogs.routes';

const router = Router();

/** Liveness: el proceso responde. No expone versión ni detalles internos. */
router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

/** Readiness: dependencias disponibles (base de datos). */
router.get('/health/ready', async (_req, res) => {
  const database = await pingDatabase();
  res.status(database ? 200 : 503).json({ success: database, status: database ? 'ready' : 'unavailable' });
});

router.use('/api/auth', authRoutes);

if (env.CLIENT_LOGS_ENABLED) {
  router.use('/api/logs/client', clientLogsRoutes);
}

export default router;
