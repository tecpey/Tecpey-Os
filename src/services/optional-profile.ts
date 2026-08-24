import { ApiError, type ApiErrorType } from "../lib/api-error";

export type OptionalProfileFailure =
  | { kind: "api_error"; errorType: ApiErrorType; status?: number }
  | { kind: "http_error"; status: number }
  | { kind: "invalid_payload" };

export type OptionalProfileResult<T> = {
  data: T | null;
  failure: OptionalProfileFailure | null;
};

/**
 * Resolve navbar profile data without turning an optional upstream dependency
 * into a root-layout availability dependency.
 *
 * Only expected API failures are degraded to an anonymous navbar. Unknown
 * exceptions still surface so framework control-flow and programming errors
 * are never hidden.
 */
export async function resolveOptionalProfile<T>(
  request: () => Promise<Response>,
): Promise<OptionalProfileResult<T>> {
  let response: Response;

  try {
    response = await request();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return {
      data: null,
      failure: {
        kind: "api_error",
        errorType: error.type,
        ...(error.status === undefined ? {} : { status: error.status }),
      },
    };
  }

  if (!response.ok) {
    return {
      data: null,
      failure: { kind: "http_error", status: response.status },
    };
  }

  try {
    const payload = (await response.json()) as { data?: T | null };
    return { data: payload?.data ?? null, failure: null };
  } catch {
    return { data: null, failure: { kind: "invalid_payload" } };
  }
}
