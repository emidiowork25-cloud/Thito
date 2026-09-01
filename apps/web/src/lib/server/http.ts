import { NextResponse } from 'next/server';

/** Matches the error envelope the frontend already reads: error.message */
export function fail(message: string, status: number) {
  return NextResponse.json({ error: { message, status } }, { status });
}

export function unauthorized() {
  return fail('Missing or invalid token', 401);
}

export function forbidden(message = 'Unauthorized') {
  return fail(message, 403);
}

/** Turns a thrown zod error into a 400, anything else into a 500. */
export function fromError(error: any, fallback: string) {
  if (error?.issues?.length) {
    return fail(error.issues[0].message, 400);
  }
  console.error(fallback, error);
  return fail(error?.message || fallback, 500);
}
