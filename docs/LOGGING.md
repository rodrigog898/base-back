# Estándar de logs JSON

Este documento es **común a backend y frontend**. Todos los componentes escriben **una línea JSON por evento** en `stdout`. Nunca se usa texto libre, `console.log` sin formato ni colores. Para leer los logs cómodamente en desarrollo, se formatean con `pino-pretty` (`npm run dev:pretty`), pero lo que se emite siempre es JSON.

Referencias: ISO/IEC 27001:2022 Anexo A **8.15** (registro de eventos), **8.16** (monitoreo), **8.17** (sincronización de relojes) y **5.34** (privacidad / PII); OWASP Logging Cheat Sheet.

## Campos

| Campo         | Tipo     | Obligatorio | Descripción |
|---------------|----------|-------------|-------------|
| `timestamp`   | string   | sí | ISO-8601 en UTC (`2026-11-07T03:31:02.068Z`). |
| `level`       | string   | sí | `fatal` · `error` · `warn` · `info` · `debug` · `trace` |
| `service`     | string   | sí | Nombre del componente (`<proyecto>-back`, `<proyecto>-front`). |
| `version`     | string   | sí | Versión desplegada (package.json, o el SHA/tag inyectado en CI). |
| `environment` | string   | sí | `development` · `test` · `production` |
| `logType`     | string   | sí | `app` · `access` · `audit` · `client` (ver abajo). |
| `message`     | string   | sí | Descripción breve legible por humanos. |
| `requestId`   | string   | si aplica | Correlación extremo a extremo, propagada en la cabecera `X-Request-Id`. |
| `userId`      | string   | si aplica | ID interno del usuario autenticado. Nunca el email. |
| `event`       | object   | audit | `{ category, action, type, outcome }`, donde `outcome` es `success` o `failure`. |
| `httpRequest` | object   | access | `{ method, path, ip, userAgent }`. **Sin query string.** |
| `httpResponse`| object   | access | `{ statusCode }` |
| `durationMs`  | number   | access | Duración de la request. |
| `err`         | object   | errores | `{ type, message, stack }` |
| `component`   | string   | opcional | Subsistema (`prisma`, `nitro`, etc.). |

### `logType`

- **app**: eventos de la aplicación (arranque, errores y advertencias).
- **access**: una línea por cada request HTTP al terminar la respuesta.
- **audit**: eventos de seguridad, como registro, login (exitoso o fallido), bloqueos, rotación y reutilización de tokens, logout, autorización denegada y rate limit excedido. En el backend también se persisten en la colección `auth_security_log`, que es append-only.
- **client**: errores del navegador que el frontend envía a `POST /api/logs/client`.

### Ejemplo

```json
{"level":"info","timestamp":"2026-11-07T03:31:02.068Z","service":"base-back","version":"2.0.0","environment":"production","logType":"audit","requestId":"e4f3a083-c1cf-4042-a33f-e31cdc3ba23b","event":{"category":"authentication","action":"login","type":"LOGIN_SUCCESS","outcome":"success"},"userId":"6aee9b76fa42c858ee3412b8","email":"a***@empresa.cl","ip":"203.0.113.10","message":"User logged in"}
```

## Reglas

1. **Datos que nunca se registran:** contraseñas, hashes, tokens (access o refresh), cabeceras `Authorization` y `Cookie`, secretos ni API keys. El logger los reemplaza automáticamente por `[REDACTED]`; aun así, no se deben pasar.
2. **PII mínima:** el email se registra enmascarado (`a***@dominio.cl`) y se usa `userId` para correlacionar.
3. **Sin query string:** en las URLs registradas se elimina todo lo que va después de `?`.
4. **Request ID:** el backend acepta un `X-Request-Id` entrante solo si cumple `^[A-Za-z0-9._-]{8,128}$`; si no, genera un UUID. Siempre lo devuelve en la respuesta y lo incluye en el cuerpo de los errores.
5. **Relojes:** todos los timestamps están en UTC. Los servidores deben sincronizarse por NTP (A.8.17).
6. **Destino:** `stdout`. La plataforma (Docker, Kubernetes, systemd) los reenvía a un SIEM o almacén centralizado, con acceso restringido y protección contra modificación (A.8.15). `LOG_FILE` es opcional y solo debe usarse en despliegues sin agente de logs.
7. **Retención sugerida:** 90 días en caliente para logs `access` y `app`, y al menos 1 año para `audit`. Debe ajustarse según la política de la organización y la legislación aplicable.
8. **Niveles:** `error` es para fallos que requieren acción, `warn` para anomalías y fallos 4xx de seguridad, `info` para eventos de negocio y auditoría, y `debug` solo en desarrollo (por ejemplo, las queries de Prisma, sin parámetros).

## Uso

**Backend** (`src/config/logger.ts`):

```ts
import { logger, auditLogger } from './config/logger';
logger.info({ component: 'billing', invoiceId }, 'Invoice generated');
logger.error({ err }, 'Payment provider failed');
// Eventos de seguridad: usar AuditService (escribe el log y lo persiste)
```

**Frontend** (`utils/logger.ts`, `useLogger()`):

```ts
const log = useLogger()
log.info('Filtro aplicado', { filter: 'activos' })
log.error('No se pudo cargar el dashboard', { err })
```

En el navegador, los niveles `warn` y `error` se envían en lotes a `POST /api/logs/client`. En el servidor Nitro (SSR), todo sale a `stdout` con este mismo esquema.
