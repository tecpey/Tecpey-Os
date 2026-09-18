export function mentorProfileWorkerErrorCode(error: unknown): string {
  const pgCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  if (pgCode && /^[A-Z0-9]{5}$/.test(pgCode)) {
    return `postgres_${pgCode}`;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 100);
  return normalized || "mentor_profile_processing_failed";
}

export function isTerminalMentorProfileWorkerError(code: string): boolean {
  return [
    "mentor_profile_event_identity_conflict",
    "mentor_profile_event_value_invalid",
    "mentor_profile_tenant_invalid",
    "mentor_profile_workspace_invalid",
    "mentor_profile_source_reference_invalid",
    "mentor_profile_occurred_at_invalid",
    "mentor_profile_outbox_conflict_missing",
    "mentor_profile_dead_letter_source_missing",
    "mentor_profile_attempt_state_missing",
    "postgres_22P02",
    "postgres_23503",
    "postgres_23514",
  ].includes(code);
}
