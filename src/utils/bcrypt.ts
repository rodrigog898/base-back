import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Compara contra un hash aleatorio para igualar el tiempo de respuesta cuando el
 * usuario no existe (mitiga enumeración de cuentas por timing).
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}
