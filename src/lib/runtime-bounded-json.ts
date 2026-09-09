const DEFAULT_MAX_JSON_BYTES = 8 * 1024 * 1024;

function validMaxBytes(value: number): number {
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_JSON_BYTES;
}

function declaredContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function readBoundedJsonResponse(
  response: Response,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown | null> {
  const limit = validMaxBytes(maxBytes);
  const declared = declaredContentLength(response);
  if (declared !== null && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const body = response.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return null;

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
