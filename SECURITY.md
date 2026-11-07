# Seguridad: base-back

Este documento relaciona los controles técnicos implementados en este template con **ISO/IEC 27001:2022 (Anexo A)** y **OWASP ASVS 4.0**.

> ISO 27001 certifica un **sistema de gestión** (políticas, riesgos, auditorías y personas), no un repositorio de código. Este template implementa los controles **técnicos** que le corresponden al software, y la organización debe complementarlos con los controles organizacionales: gestión de accesos, respaldos, continuidad, proveedores, etc.

## Controles implementados

| Control ISO 27001:2022 | Implementación |
|---|---|
| **5.15 / 8.3** Control de acceso | `authenticate` y `authorize(...roles)`. El rol se toma de la BD en cada request, no del token. |
| **5.17** Información de autenticación | Contraseñas de 12 a 128 caracteres (máximo 72 bytes, el límite de bcrypt) con mayúscula, minúscula y número. Se guardan con bcrypt (cost 12). |
| **8.5** Autenticación segura | JWT HS256 con algoritmo fijado, `iss`/`aud`/`typ` verificados y access token de 15 min sin PII. El refresh token va en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, se rota en cada uso y su reutilización revoca todas las sesiones. Hay bloqueo por cuenta y por IP tras N intentos, mensajes genéricos (sin enumeración de usuarios), bcrypt *dummy* para igualar tiempos, y logout y logout-all. |
| **8.24** Criptografía | En producción se exigen secretos de 64 caracteres o más, distintos entre sí y que no sean de ejemplo. Los refresh tokens se guardan solo como hash SHA-256. |
| **8.15** Registro de eventos | Logs JSON estructurados ([docs/LOGGING.md](docs/LOGGING.md)) con `requestId` de correlación, redacción automática de secretos y auditoría persistente append-only (`auth_security_log`). |
| **8.16** Monitoreo | Hay eventos `audit` para fallos de login, bloqueos, reutilización de tokens, autorización denegada y rate limit. Están listos para crear alertas en el SIEM. |
| **5.34** Privacidad / PII | Email enmascarado en los logs, query strings excluidas y queries de BD sin parámetros. |
| **8.6** Gestión de capacidad / DoS | Rate limit global, de auth y de client-logs. Body limitado a 100 kb y timeouts de headers y requests. |
| **8.9** Gestión de configuración | Variables de entorno validadas con Zod y fail-fast. Valores inseguros rechazados en producción. |
| **8.20 / 8.21** Seguridad de redes | CORS con lista blanca y credenciales, `TRUST_PROXY` explícito y la IP real tomada de `req.ip` (nunca de `X-Forwarded-For` sin validar). |
| **8.26** Requisitos de seguridad de aplicaciones | Helmet: CSP `default-src 'none'`, HSTS en producción, `X-Frame-Options: DENY`, `noSniff`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en `/api`. Protección CSRF por Origin en los endpoints que usan cookie. |
| **8.28** Codificación segura | Validación estricta con Zod (`strictObject`). Se rechazan los operadores NoSQL (`$`, `.`) y el prototype pollution, los errores son genéricos para el cliente y el detalle queda en los logs. Usa ESLint con `eslint-plugin-security`. |
| **8.8** Vulnerabilidades técnicas | `npm audit` en CI, Dependabot semanal y `overrides` para dependencias transitivas vulnerables. |
| **8.25 / 8.29** Ciclo de desarrollo seguro y pruebas | En CI corren lint, typecheck, tests (incluidos los de seguridad) y build. |
| **8.2** Privilegios | El contenedor corre como usuario `node`, sin root. |
| **8.13 / 8.14** | *Fuera del código:* respaldos de MongoDB y redundancia. Son responsabilidad de la infraestructura. |

## Checklist de despliegue a producción

- [ ] `NODE_ENV=production` con secretos JWT generados con `openssl rand -hex 48` y guardados en un gestor de secretos, no en el repositorio.
- [ ] MongoDB con autenticación, TLS, usuario de mínimo privilegio y respaldos cifrados.
- [ ] `CORS_ORIGINS` con los dominios exactos del frontend.
- [ ] `TRUST_PROXY` con el número de saltos o las IPs del load balancer.
- [ ] Toda la comunicación por HTTPS (TLS 1.2 o superior) con terminación en el proxy.
- [ ] `stdout` enviado a un SIEM con retención definida y alertas sobre `logType=audit` y `outcome=failure`.
- [ ] Ejecutar `npm run seed` una sola vez con un `ADMIN_PASSWORD` fuerte y cambiarlo después del primer login.
- [ ] NTP activo en los hosts.

## Reporte de vulnerabilidades

Se deben reportar en privado al responsable del proyecto. No hay que abrir issues públicos con detalles de explotación.
