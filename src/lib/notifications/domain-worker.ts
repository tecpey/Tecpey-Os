export function notificationDomainWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 100);
  return normalized || "notification_domain_processing_failed";
}

export function isTerminalNotificationDomainError(code: string): boolean {
  return [
    "notification_domain_event_invalid",
    "notification_domain_outbox_event_invalid",
    "notification_domain_event_fingerprint_mismatch",
    "notification_domain_effective_event_invalid",
    "notification_principal_not_found",
    "notification_principal_inactive",
    "notification_event_locale_mismatch",
    "notification_correlation_payload_conflict",
    "notification_domain_event_identity_conflict",
  ].includes(code);
}
