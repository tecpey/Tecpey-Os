'use server'

import { ApiError } from "./api-error";
import { getSessionToken } from "./session";
import { getLocale } from "next-intl/server";
import { logger } from "./logger";

interface ApiFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryOnNetworkError?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;

function isRetryable(error: ApiError): boolean {
  return (
    error.type === "NO_CONNECTION" ||
    error.type === "TIMEOUT" ||
    error.type === "SERVER_ERROR"
  );
}

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal as AbortSignal | undefined;
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeoutId = setTimeout(abort, timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abort);
  }
}

export const apiFetch = async (
  input: string,
  init: ApiFetchOptions = {},
): Promise<Response> => {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryOnNetworkError = true,
    ...fetchInit
  } = init;

  if (!input.startsWith("/")) {
    throw new ApiError("UNKNOWN", undefined, "API path must be relative");
  }

  const [token, locale] = await Promise.all([getSessionToken(), getLocale()]);
  if (!token) {
    throw new ApiError("UNAUTHORIZED", 401, "Authenticated session required");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      undefined,
      "Service is temporarily unavailable",
    );
  }

  const url = `${baseUrl}/api/v1/user${input}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Language": locale,
    "Accept-Domain": `${process.env.NEXT_PUBLIC_API_FRONTEND_URL ?? ""}`,
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
        timeout,
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

      const delay = 1000 * Math.pow(2, attempt);
      attempt += 1;
      logger.warn("[apiFetch] retrying after failure", {
        attempt,
        retries,
        errorType: error.type,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }
};
