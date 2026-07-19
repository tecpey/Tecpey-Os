import type { PoolClient } from "pg";
import { enqueueNotificationDomainEvent } from "./domain-outbox";
import { resolveNotificationPrincipal } from "./principal";

export type AcademyAssessmentNotificationInput = {
  studentId: string;
  accountId: string | null;
  email: string | null;
  locale: "fa" | "en";
  termNumber: number;
  assessmentTitle: string;
  percent: number;
  passed: boolean;
  requestHash: string;
};

/**
 * Enqueue only after the authoritative assessment state, rewards and command
 * result have been written, but before the surrounding domain transaction
 * commits. A later worker creates the governed notification intent.
 */
export async function enqueueAcademyAssessmentCompleted(
  client: PoolClient,
  input: AcademyAssessmentNotificationInput,
): Promise<{ outboxId: string; replayed: boolean }> {
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new Error("academy_assessment_notification_request_hash_invalid");
  }
  if (!Number.isInteger(input.termNumber) || input.termNumber < 1 || input.termNumber > 7) {
    throw new Error("academy_assessment_notification_term_invalid");
  }
  if (!Number.isInteger(input.percent) || input.percent < 0 || input.percent > 100) {
    throw new Error("academy_assessment_notification_percent_invalid");
  }

  const principal = await resolveNotificationPrincipal(client, {
    accountId: input.accountId,
    studentId: input.studentId,
    email: input.email,
    locale: input.locale,
  });
  if (principal.status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  const clock = await client.query<{ occurred_at: Date }>(
    `SELECT CURRENT_TIMESTAMP AS occurred_at`,
  );
  const occurredAt = clock.rows[0]?.occurred_at;
  if (!occurredAt) throw new Error("academy_assessment_notification_clock_missing");

  return enqueueNotificationDomainEvent(client, {
    id: `academy-assessment:${input.studentId}:${input.locale}:${input.termNumber}:${input.requestHash}`,
    tenantId: principal.tenantId,
    principalId: principal.id,
    occurredAt: occurredAt.toISOString(),
    locale: input.locale,
    version: 1,
    type: "academy.assessment_completed",
    payload: {
      assessmentId: `term-${input.termNumber}`,
      title: input.assessmentTitle,
      score: input.percent,
      passed: input.passed,
    },
  });
}
