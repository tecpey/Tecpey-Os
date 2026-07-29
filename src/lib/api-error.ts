export type ApiErrorType =
    | "NO_CONNECTION"
    | "TIMEOUT"
    | "UNAUTHORIZED"
    | "SERVER_ERROR"
    | "CLIENT_ERROR"
    | "SERVICE_UNAVAILABLE"
    | "UNKNOWN";

export class ApiError extends Error {
    constructor(
        public readonly type: ApiErrorType,
        public readonly status?: number,
        message?: string
    ) {
        super(message ?? type);
        this.name = "ApiError";
    }
}