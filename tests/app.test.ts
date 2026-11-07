import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app';

describe('app HTTP', () => {
  it('GET /health responde y propaga X-Request-Id', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'abc-12345678');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it('genera un request id cuando el entrante no es seguro', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aplica cabeceras de seguridad', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('404 en JSON con requestId', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'ROUTE_NOT_FOUND' });
    expect(res.body.requestId).toBeTypeOf('string');
  });

  it('rechaza operadores NoSQL en el body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSAFE_INPUT');
  });

  it('rechaza prototype pollution', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":"a@b.cl","password":"x","__proto__":{"admin":true}}');
    expect(res.status).toBe(400);
  });

  it('JSON malformado devuelve 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
  });

  it('bloquea orígenes CORS no permitidos', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
  });

  it('refresh exige Origin de confianza (CSRF)', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('/api/* no se cachea', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('valida el payload de client logs', async () => {
    const ok = await request(app)
      .post('/api/logs/client')
      .send({ logs: [{ level: 'error', message: 'boom', context: { component: 'X' } }] });
    expect(ok.status).toBe(202);

    const bad = await request(app).post('/api/logs/client').send({ logs: [{ level: 'fatal', message: 'x' }] });
    expect(bad.status).toBe(400);
  });
});
