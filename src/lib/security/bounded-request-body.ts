import { NextRequest } from "next/server";

export type BoundedJsonBodyErrorCode =
  | "invalid_body_limit"
  | "invalid_content_length"
  | "unsupported_content_encoding"
  | "unsupported_media_type"
  | "payload_too_large"
  | "body_read_failed"
  | "invalid_utf8"
  | "invalid_json";

export type BoundedJsonBodyFailure = {
  ok: false;
  error: BoundedJsonBodyErrorCode;
  status: 400 | 413 | 415 | 500;
};

export type BoundedJsonBodyResult<T = unknown> =
  | {
      ok: true;
      value: T;
      bytesRead: number;
    }
  | BoundedJsonBodyFailure;

export type BoundedBodyResult =
  | {
      ok: true;
      bytes: Uint8Array;
      bytesRead: number;
    }
  | BoundedJsonBodyFailure;

export type BoundedJsonRequestResult<T = unknown> =
  | {
      ok: true;
      request: NextRequest;
      value: T;
      bytesRead: number;
    }
  | BoundedJsonBodyFailure;

export type ReadJsonBodyOptions = {
  maxBytes: number;
  allowEmptyObject?: boolean;
  requireJsonContentType?: boolean;
};

export type ReadBoundedBodyOptions = {
  maxBytes: number;
};

const MAX_GOVERNED_BODY_BYTES = 8 * 1024 * 1024;

function failure(
  error: BoundedJsonBodyErrorCode,
  status: 400 | 413 | 415 | 500,
): BoundedJsonBodyFailure {
  return { ok: false, error, status };
}

function validJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function declaredContentLength(
  value: string | null,
  maxBytes: number,
): BoundedJsonBodyFailure | null {
  if (value === null || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) {
    return failure("invalid_content_length", 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return failure("invalid_content_length", 400);
  }
  if (parsed > maxBytes) return failure("payload_too_large", 413);
  return null;
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // The connection may already be closed. The original bounded-body result is
    // authoritative and must not be replaced by a best-effort cancel failure.
  }
}

function validateBodyLimit(maxBytes: number): BoundedJsonBodyFailure | null {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_GOVERNED_BODY_BYTES
  ) {
    return failure("invalid_body_limit", 500);
  }
  return null;
}

function validateContentEncoding(request: Request): BoundedJsonBodyFailure | null {
  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    return failure("unsupported_content_encoding", 415);
  }
  return null;
}

/**
 * Reads an arbitrary untrusted request body while enforcing a hard byte ceiling
 * against the stream itself. This is the binary/multipart counterpart to
 * readJsonBody: Content-Length is only an early reject, compressed bodies are
 * rejected, and chunked transfer cannot bypass the byte counter.
 */
export async function readBoundedBody(
  request: Request,
  options: ReadBoundedBodyOptions,
): Promise<BoundedBodyResult> {
  const invalidLimit = validateBodyLimit(options.maxBytes);
  if (invalidLimit) return invalidLimit;

  const invalidEncoding = validateContentEncoding(request);
  if (invalidEncoding) return invalidEncoding;

  const declared = declaredContentLength(
    request.headers.get("content-length"),
    options.maxBytes,
  );
  if (declared) return declared;

  if (!request.body) {
    return { ok: true, bytes: new Uint8Array(0), bytesRead: 0 };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await cancelReader(reader, "invalid_body_chunk");
        return failure("body_read_failed", 400);
      }
      bytesRead += value.byteLength;
      if (bytesRead > options.maxBytes) {
        await cancelReader(reader, "payload_too_large");
        return failure("payload_too_large", 413);
      }
      if (value.byteLength > 0) chunks.push(value);
    }
  } catch {
    await cancelReader(reader, "body_read_failed");
    return failure("body_read_failed", 400);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, bytes, bytesRead };
}

/**
 * Reads and parses an untrusted JSON request body while enforcing the maximum
 * against bytes actually consumed from the stream. Content-Length is used only
 * for early rejection; missing, forged and chunked metadata cannot bypass the
 * streaming counter.
 *
 * Compressed request bodies are rejected. Accepting compressed bytes before a
 * separately governed decompression ceiling would permit expansion bombs.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  options: ReadJsonBodyOptions,
): Promise<BoundedJsonBodyResult<T>> {
  const maxBytes = options.maxBytes;
  const invalidLimit = validateBodyLimit(maxBytes);
  if (invalidLimit) return invalidLimit;

  const invalidEncoding = validateContentEncoding(request);
  if (invalidEncoding) return invalidEncoding;

  if (
    options.requireJsonContentType !== false &&
    !validJsonContentType(request.headers.get("content-type"))
  ) {
    return failure("unsupported_media_type", 415);
  }

  const declared = declaredContentLength(
    request.headers.get("content-length"),
    maxBytes,
  );
  if (declared) return declared;

  if (!request.body) {
    if (options.allowEmptyObject) {
      return { ok: true, value: {} as T, bytesRead: 0 };
    }
    return failure("invalid_json", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await cancelReader(reader, "invalid_body_chunk");
        return failure("body_read_failed", 400);
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await cancelReader(reader, "payload_too_large");
        return failure("payload_too_large", 413);
      }
      if (value.byteLength > 0) chunks.push(value);
    }
  } catch {
    await cancelReader(reader, "body_read_failed");
    return failure("body_read_failed", 400);
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(combined);
  } catch {
    return failure("invalid_utf8", 400);
  }

  if (text.trim() === "") {
    if (options.allowEmptyObject) {
      return { ok: true, value: {} as T, bytesRead };
    }
    return failure("invalid_json", 400);
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text) as T,
      bytesRead,
    };
  } catch {
    return failure("invalid_json", 400);
  }
}

/**
 * Preserves a route's existing parser and validation semantics while replacing
 * its unbounded body source with a normalized NextRequest backed by JSON that
 * has already passed the streaming byte limit and media-type authority.
 *
 * Call this at the exact point where the route would otherwise invoke
 * `request.json()` or `request.text()`, after its existing CSRF/auth/rate-limit
 * checks. The returned request keeps the original URL, method, cookies, custom
 * headers, request ID and abort signal.
 */
export async function readBoundedJsonRequest<T = unknown>(
  request: NextRequest,
  options: ReadJsonBodyOptions,
): Promise<BoundedJsonRequestResult<T>> {
  const parsed = await readJsonBody<T>(request, options);
  if (!parsed.ok) return parsed;

  const serialized = JSON.stringify(parsed.value);
  if (serialized === undefined) return failure("invalid_json", 400);

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/json; charset=utf-8");

  const boundedRequest = new NextRequest(request.url, {
    method: request.method,
    headers,
    body: serialized,
    signal: request.signal,
  });

  return {
    ok: true,
    request: boundedRequest,
    value: parsed.value,
    bytesRead: parsed.bytesRead,
  };
}
