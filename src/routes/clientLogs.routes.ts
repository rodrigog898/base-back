import { Request, Response, Router } from 'express';
import { clientLogger } from '../config/logger';
import { clientLogsRateLimiter } from '../middlewares/rateLimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { ClientLogsInput, clientLogsSchema } from '../schemas';
import { clientIp } from '../utils/network';

/**
 * Ingesta de logs del frontend: los errores del navegador quedan en el mismo
 * pipeline JSON que el backend (logType=client), correlacionables por requestId.
 */
const router = Router();

router.post('/', clientLogsRateLimiter, validate(clientLogsSchema), (req: Request, res: Response) => {
  const { logs } = req.body as ClientLogsInput;
  const ip = clientIp(req);

  for (const entry of logs) {
    clientLogger[entry.level](
      {
        clientTimestamp: entry.timestamp,
        clientRequestId: entry.requestId,
        url: entry.url?.split('?')[0],
        userAgent: entry.userAgent,
        context: entry.context,
        ip,
      },
      entry.message
    );
  }

  res.status(202).json({ success: true });
});

export default router;
