import { ApiError } from "./api-error";

const SERVER_NETWORK_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function hasServerNetworkErrorCode(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      return false;
    }
    seen.add(current);

    const candidate = current as { cause?: unknown; code?: unknown };
    if (
      typeof candidate.code === "string" &&
      SERVER_NETWORK_ERROR_CODES.has(candidate.code)
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}

export function classifyFetchError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError("TIMEOUT", undefined, "Request timed out");
  }
  if (
    error instanceof TypeError &&
    (/failed to fetch|fetch failed|networkerror|load failed/i.test(
      error.message,
    ) ||
      hasServerNetworkErrorCode(error))
  ) {
    return new ApiError("NO_CONNECTION", undefined, "No internet connection");
  }
  return new ApiError("UNKNOWN", undefined, String(error));
}
