import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { corsOrigins, env } from './config/env';
import { accessLog, requestContext } from './middlewares/requestContext.middleware';
import { noStore, securityHeaders } from './middlewares/security.middleware';
import { rejectUnsafeInput } from './utils/sanitize';
import { globalRateLimiter } from './middlewares/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { CorsError } from './utils/errors';
import routes from './routes';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
// Express 5: el parser "simple" no construye objetos anidados desde la query string.
app.set('query parser', 'simple');

// 1. Correlación + access log (primero, para que todo quede registrado)
app.use(requestContext);
app.use(accessLog);

// 2. Cabeceras de seguridad y CORS con lista blanca
app.use(securityHeaders);
app.use(
  cors({
    origin: (origin, callback) => {
      // Sin Origin = cliente no-navegador (curl, health checks). CSRF se controla aparte.
      if (!origin || corsOrigins.includes(origin)) callback(null, true);
      else callback(new CorsError());
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  })
);

// 3. Limitación y parsing con tamaños acotados
app.use(globalRateLimiter);
app.use(compression());
app.use(express.json({ limit: env.BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }));
app.use(cookieParser());
app.use(rejectUnsafeInput);
app.use('/api', noStore);

app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
