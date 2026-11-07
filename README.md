# base-back

API base con **Express 5 + TypeScript + Prisma 6 + MongoDB**, con logs **JSON estructurados** y controles de seguridad alineados a **ISO/IEC 27001:2022** ([SECURITY.md](SECURITY.md)).

## Arquitectura

```
src/
├── app.ts                 # Pipeline de middlewares (orden importa)
├── server.ts              # Arranque, graceful shutdown, handlers fatales
├── container.ts           # Inyección de dependencias manual
├── config/
│   ├── env.ts             # Validación Zod de variables (fail-fast)
│   ├── logger.ts          # pino JSON: logger / accessLogger / auditLogger / clientLogger
│   └── prisma.ts          # Cliente Prisma con logs → JSON
├── context/requestContext.ts   # AsyncLocalStorage (requestId, userId)
├── middlewares/           # requestContext, security, auth, rateLimit, validate, error
├── routes/                # health, auth, logs/client
├── controllers/           # HTTP ⇄ servicio
├── services/              # Lógica de negocio (auth, audit)
├── repositories/          # Acceso a datos (raw commands: compatibles con Mongo standalone)
├── schemas/               # Esquemas Zod de entrada
├── types/  utils/
tests/                     # Vitest + supertest
docs/LOGGING.md            # Estándar de logs (común con el frontend)
```

**Pipeline de requests:** requestContext (X-Request-Id) → access log → helmet → CORS → rate limit → compression → JSON (100 kb) → cookies → rechazo de input inseguro → `no-store` en `/api` → rutas → 404 → error handler.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET  | `/health` | Liveness |
| GET  | `/health/ready` | Readiness (ping a la BD) |
| POST | `/api/auth/register` | Registro. Devuelve `accessToken` y deja el refresh token en una cookie HttpOnly |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Rota el refresh token (cookie). Requiere `Origin` permitido |
| POST | `/api/auth/logout` | Revoca la sesión actual |
| POST | `/api/auth/logout-all` | Revoca todas las sesiones (requiere Bearer) |
| GET  | `/api/auth/me` | Usuario actual (requiere Bearer) |
| POST | `/api/logs/client` | Ingesta de logs del frontend (rate limited) |

Las respuestas de error tienen esta forma: `{ success: false, code, message, requestId }`.

## Desarrollo

```bash
cp .env.example .env          # completa los secretos
npm install
npm run setup                 # prisma generate + db push + seed (requiere ADMIN_PASSWORD)
npm run dev                   # logs JSON
npm run dev:pretty            # los mismos logs, formateados para leer
```

| Script | |
|---|---|
| `npm run lint` / `typecheck` / `test` / `build` | Calidad (lo mismo corre en CI) |
| `npm run audit:deps` | Vulnerabilidades en dependencias de producción |

## Docker

```bash
docker build -t base-back .
docker run --env-file .env -p 3000:3000 base-back
```
