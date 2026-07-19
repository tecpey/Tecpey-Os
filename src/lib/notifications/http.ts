import { apiError, apiOk } from "../api-validation";

export const NOTIFICATION_PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Vary: "Cookie",
});

export function notificationApiOk<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
) {
  return apiOk(payload, status, NOTIFICATION_PRIVATE_HEADERS);
}

export function notificationApiError(
  error: string,
  status: number,
  details?: unknown,
) {
  return apiError(error, status, details, NOTIFICATION_PRIVATE_HEADERS);
}
