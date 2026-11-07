import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildLoggerOptions, maskEmail } from '../src/config/logger';
import { runWithContext } from '../src/context/requestContext';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  const log = pino({ ...buildLoggerOptions({ logType: 'audit' }), level: 'info' }, stream);
  return { log, lines };
}

describe('logger JSON', () => {
  it('emite el esquema común en JSON', () => {
    const { log, lines } = capture();
    log.info({ event: { action: 'login', outcome: 'success' } }, 'hola');

    const line = lines[0]!;
    expect(line.level).toBe('info');
    expect(line.message).toBe('hola');
    expect(line.logType).toBe('audit');
    expect(line.service).toBeTypeOf('string');
    expect(line.environment).toBe('test');
    expect(new Date(line.timestamp as string).toISOString()).toBe(line.timestamp);
  });

  it('no duplica claves', () => {
    const { log } = capture();
    let raw = '';
    const stream = new Writable({
      write(chunk, _e, cb) {
        raw = chunk.toString();
        cb();
      },
    });
    pino({ ...buildLoggerOptions({ logType: 'app' }), level: 'info' }, stream).info('x');
    expect(raw.match(/"logType"/g)).toHaveLength(1);
    expect(log).toBeDefined();
  });

  it('redacta secretos', () => {
    const { log, lines } = capture();
    log.info({ password: 'Secreta123456', body: { refreshToken: 'abc' }, req: { headers: { authorization: 'Bearer x' } } }, 'x');

    const line = lines[0] as any;
    expect(line.password).toBe('[REDACTED]');
    expect(line.body.refreshToken).toBe('[REDACTED]');
    expect(line.req.headers.authorization).toBe('[REDACTED]');
  });

  it('agrega requestId y userId desde el contexto', () => {
    const { log, lines } = capture();
    runWithContext({ requestId: 'req-12345678', userId: 'u1' }, () => log.info('ctx'));
    expect(lines[0]).toMatchObject({ requestId: 'req-12345678', userId: 'u1' });
  });

  it('enmascara emails', () => {
    expect(maskEmail('juan.perez@empresa.cl')).toBe('j***@empresa.cl');
    expect(maskEmail(undefined)).toBeUndefined();
  });
});
