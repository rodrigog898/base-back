import { Prisma } from '@prisma/client';
import { AppError } from './errors';

const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

const RETRYABLE_NETWORK_MESSAGE = /(fetch failed|network ?error|socket hang up|timed? ?out)/i;

type PublicError = {
  statusCode: number;
  message: string;
};

function hasCode(error: unknown): error is { code: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string';
}

function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string';
}

export function mapPublicError(error: unknown): PublicError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        statusCode: 409,
        message: 'Ya existe un registro con este valor.',
      };
    }

    if (RETRYABLE_PRISMA_CODES.has(error.code)) {
      return {
        statusCode: 503,
        message: 'El servicio está temporalmente no disponible. Intenta nuevamente.',
      };
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientRustPanicError
    || error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return {
      statusCode: 503,
      message: 'El servicio está temporalmente no disponible. Intenta nuevamente.',
    };
  }

  if (hasCode(error) && RETRYABLE_NETWORK_CODES.has(error.code)) {
    return {
      statusCode: 503,
      message: 'No pudimos comunicarnos con el servicio. Intenta nuevamente.',
    };
  }

  if (hasMessage(error) && RETRYABLE_NETWORK_MESSAGE.test(error.message)) {
    return {
      statusCode: 503,
      message: 'No pudimos comunicarnos con el servicio. Intenta nuevamente.',
    };
  }

  return {
    statusCode: 500,
    message: 'No pudimos completar la operación. Intenta nuevamente.',
  };
}
