export type BoundedJsonBodyErrorCode =
  | "invalid_body_limit"
  | "invalid_content_length"
  | "unsupported_content_encoding"
  | "unsupported_media_type"
  | "payload_too_large"
  | "body_read_failed"
  | "invalid_utf8"
  | "invalid_json";

export type BoundedJsonBodyResult<T = unknown> =
  | {
      ok: true;
      value: T;
      bytesRead: number;
    }
  | {
      ok: false;
      error: BoundedJsonBodyErrorCode;
      status: 400 | 413 | 415 | 500;
    };

export type ReadJsonBodyOptions = {
  maxBytes: number;
  allowEmptyObject?: boolean;
  requireJsonContentType?: boolean;
};

const MAX_GOVERNED_BODY_BYTES = 8 * 1024 * 1024;

function failure(
  error: BoundedJsonBodyErrorCode,
  status: 400 | 413 | 415 | 500,
): BoundedJsonBodyResult<never> {
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
): BoundedJsonBodyResult<null> | null {
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
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_GOVERNED_BODY_BYTES
  ) {
    return failure("invalid_body_limit", 500);
  }

  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    return failure("unsupported_content_encoding", 415);
  }

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
