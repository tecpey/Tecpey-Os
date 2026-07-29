import type { NextRequest, NextResponse } from "next/server";

/** Set by proxy on the forwarded request so API route handlers can read it. */
export const TRACE_REQUEST_HEADER = "x-tecpey-request-id";
/** Returned to clients on every response. */
export const TRACE_RESPONSE_HEADER = "x-request-id";

export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Extract the request ID from an incoming request.
 * Falls back to generating a new one when the proxy header is absent
 * (direct API calls that bypass the proxy matcher).
 */
export function getRequestId(req: NextRequest): string {
  return req.headers.get(TRACE_REQUEST_HEADER) || generateRequestId();
}

/** Attach the request ID response header to an outgoing response. */
export function attachRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(TRACE_RESPONSE_HEADER, requestId);
  return response;
}
