'use server'

import { ApiError } from "./api-error";
import { getSession } from "./session";
import { getLocale } from "next-intl/server";
import { logger } from "./logger";



/**
 * apiFetch - universal fetch for dev/prod that prefixes API calls with the correct base URL
 *
 * Usage:
 *   apiFetch('/users', { method: 'GET' })
 *   apiFetch('https://external.com/endpoint') // untouched
*/


// ─── Config ───────────────────────────────────────────────────────────────────

interface ApiFetchOptions extends RequestInit {
  /** Timeout in milliseconds — default: 10 seconds */
  timeout?: number;
  /** Number of retries — default: 2 */
  retries?: number;
  /** Whether to retry on network error — default: true */
  retryOnNetworkError?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Return true if this type of error is retryable */
function isRetryable(error: ApiError): boolean {
  return (
    error.type === "NO_CONNECTION" ||
    error.type === "TIMEOUT" ||
    error.type === "SERVER_ERROR"
  );
}


const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;


/** Convert raw fetch error to ApiError */
function classifyFetchError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError("TIMEOUT", undefined, "Request timed out");
  }

  if (
    error instanceof TypeError &&
    (error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError") ||
      error.message.includes("Load failed"))
  ) {
    return new ApiError("NO_CONNECTION", undefined, "No internet connection");
  }

  return new ApiError("UNKNOWN", undefined, String(error));
}


// ─── Core fetch with timeout ────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();

  // If the user has signaled herself, listen to both
  const externalSignal = init.signal as AbortSignal | undefined;
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}


// ─── apiFetch ────────────────────────────────────────────────────────────

export const apiFetch = async (
  input: string,
  init: ApiFetchOptions = {}
): Promise<Response> => {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryOnNetworkError = true,
    ...fetchInit
  } = init;

  const [session, locale] = await Promise.all([getSession(), getLocale()]);

  const baseUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    throw new ApiError("SERVICE_UNAVAILABLE", undefined, "Service is temporarily unavailable");
  }

  const url = baseUrl + "/api/v1/user" + input;

  const headers: HeadersInit = {
    Authorization: `Bearer ${(session as { user?: { token?: string } })?.user?.token ?? ""}`,
    Accept: "application/json",
    "Accept-Language": locale,
    "Accept-Domain": `${process.env.NEXT_PUBLIC_API_FRONTEND_URL}`,
    ...(fetchInit.body && !(fetchInit.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...fetchInit.headers,
  };

  let attempt = 0;

  while (true) {
    try {
      const response = await fetchWithTimeout(
        url,
        { ...fetchInit, headers },
        timeout
      );


      if (response.status >= 500) {
        throw new ApiError("SERVER_ERROR", response.status);
      }
      return response;

    } catch (raw) {
      const error = classifyFetchError(raw);

      const canRetry =
        retryOnNetworkError &&
        isRetryable(error) &&
        attempt < retries;

      if (!canRetry) throw error;

      // Exponential backoff: 1s، ۲s، ۴s ...
      const delay = 1000 * Math.pow(2, attempt);
      attempt++;

      logger.warn("[apiFetch] retrying after failure", { attempt, retries, errorType: error.type, delayMs: delay });

      await sleep(delay);
    }
  }
};
