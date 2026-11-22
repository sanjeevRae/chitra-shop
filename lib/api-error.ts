// Safe error handling for Chitra E-commerce API routes.
//
// safeError(error, fallbackMessage) logs the raw error server-side (for
// debugging) and returns only a generic fallback message to the client,
// preventing information disclosure via error messages.

import { NextResponse } from 'next/server';

export function safeError(
  error: unknown,
  fallbackMessage: string,
  status = 500,
): ReturnType<typeof NextResponse.json> {
  console.error('[api-error]', error instanceof Error ? error.message : String(error));
  return NextResponse.json({ error: fallbackMessage }, { status });
}

export function jsonError(message: string, status = 400): ReturnType<typeof NextResponse.json> {
  return NextResponse.json({ error: message }, { status });
}
