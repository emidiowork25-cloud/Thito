import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/** Matches the error envelope the frontend already reads: error.message */
export function fail(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { message, status, ...extra } }, { status });
}

export function unauthorized() {
  return fail('Não autenticado', 401);
}

export function forbidden(message = 'Acesso negado') {
  return fail(message, 403);
}

export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: {
        message: 'Muitas tentativas. Tente novamente em instantes.',
        status: 429,
      },
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/**
 * Zod failures describe the caller's own input, so they are safe to return.
 * Anything else is logged with a correlation id and answered generically:
 * a raw exception message can name tables, columns, hosts or credentials.
 */
export function fromError(error: any, fallback: string) {
  if (error?.issues?.length) {
    const issue = error.issues[0];
    const field = issue.path?.join('.');
    return fail(field ? `${field}: ${issue.message}` : issue.message, 400);
  }

  const errorId = randomUUID();
  console.error(`[${errorId}] ${fallback}:`, error);
  return fail(fallback, 500, { errorId });
}
