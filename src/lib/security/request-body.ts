const DEFAULT_MAX_BYTES = 32_768;
const ABSOLUTE_MAX_BYTES = 2 * 1024 * 1024;

export type JsonBodyErrorCode =
  | "payload_too_large"
  | "unsupported_content_encoding"
  | "unsupported_media_type"
  | "invalid_body_encoding"
  | "invalid_json"
  | "invalid_request_body";

export type ParsedRequestJson = Awaited<ReturnType<Request["json"]>>;

export type JsonBodyResult<T> =
  | { ok: true; value: T; bytesRead: number }
  | { ok: false; error: JsonBodyErrorCode; status: 400 | 413 | 415 };

export type JsonBodyOptions = {
  maxBytes?: number;
  allowEmptyObject?: boolean;
  requireJsonContentType?: boolean;
};

function failure(
  error: JsonBodyErrorCode,
  status: 400 | 413 | 415,
): JsonBodyResult<never> {
  return { ok: false, error, status };
}

function normalizedMaxBytes(value: number | undefined): number {
  const maxBytes = value ?? DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > ABSOLUTE_MAX_BYTES) {
    throw new Error("invalid_request_body_limit");
  }
  return maxBytes;
}

function isSupportedContentEncoding(value: string | null): boolean {
  if (!value?.trim()) return true;
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .every((part) => part === "identity");
}

function isJsonMediaType(value: string | null): boolean {
  if (!value?.trim()) return true;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"));
}

function declaredLength(value: string | null): number | null {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function cancelQuietly(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // The stream may already be closed or errored. The request is rejected
    // regardless, so cancellation errors are intentionally ignored.
  }
}

export async function readJsonBody<T = ParsedRequestJson>(
  request: Request,
  options: JsonBodyOptions = {},
): Promise<JsonBodyResult<T>> {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
  const allowEmptyObject = options.allowEmptyObject === true;
  const requireJsonContentType = options.requireJsonContentType !== false;

  if (!isSupportedContentEncoding(request.headers.get("content-encoding"))) {
    return failure("unsupported_content_encoding", 415);
  }
  if (
    requireJsonContentType &&
    !isJsonMediaType(request.headers.get("content-type"))
  ) {
    return failure("unsupported_media_type", 415);
  }

  const hintedLength = declaredLength(request.headers.get("content-length"));
  if (hintedLength !== null && hintedLength > maxBytes) {
    return failure("payload_too_large", 413);
  }

  if (!request.body) {
    if (allowEmptyObject) {
      return { ok: true, value: {} as T, bytesRead: 0 };
    }
    return failure("invalid_json", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await cancelQuietly(reader, "payload_too_large");
        return failure("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } catch {
    return failure("invalid_request_body", 400);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Some runtimes disallow release after cancellation; no action needed.
    }
  }

  if (totalBytes === 0) {
    if (allowEmptyObject) {
      return { ok: true, value: {} as T, bytesRead: 0 };
    }
    return failure("invalid_json", 400);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failure("invalid_body_encoding", 400);
  }

  try {
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    return {
      ok: true,
      value: JSON.parse(normalized) as T,
      bytesRead: totalBytes,
    };
  } catch {
    return failure("invalid_json", 400);
  }
}
