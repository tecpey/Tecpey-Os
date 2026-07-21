import "server-only";

import type { PoolClient } from "pg";
import { awardAcademyReward, readLearningCommand, storeLearningCommand } from "@/lib/academy-authority";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";
import { getChallengeCycle, type ChallengeCycle } from "@/lib/community-challenges";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const JOURNAL_REFLECTION_CHALLENGE_ID = "journal-reflection-week";
export const JOURNAL_REFLECTION_MIN_TRADES = 3;
export const JOURNAL_REFLECTION_MIN_RATE = 0.8;
export const JOURNAL_REFLECTION_REWARD_XP = 200;
export const JOURNAL_REFLECTION_BADGE = "journal-master";

export type JournalChallengeStatus = {
  challengeId: typeof JOURNAL_REFLECTION_CHALLENGE_ID;
  weekKey: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  consentEnabled: boolean;
  closedTradeCount: number;
  reflectedTradeCount: number;
  reflectionRate: number;
  score: number;
  minTrades: typeof JOURNAL_REFLECTION_MIN_TRADES;
  minRate: typeof JOURNAL_REFLECTION_MIN_RATE;
  eligible: boolean;
  completed: boolean;
  rewardedAt: string | null;
  reward: {
    xp: typeof JOURNAL_REFLECTION_REWARD_XP;
    badge: typeof JOURNAL_REFLECTION_BADGE;
  };
};

export type JournalChallengeLoadResult =
  | { available: true; status: JournalChallengeStatus }
  | { available: false; status: null };

export type JournalChallengeClaimAudit = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type JournalChallengeClaimResult =
  | {
      ok: true;
      changed: boolean;
      replayed: boolean;
      status: JournalChallengeStatus;
      progress: Record<string, unknown>;
      progressRevision: number;
    }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "inactive"
        | "consent_required"
        | "not_eligible"
        | "idempotency_conflict";
      status: JournalChallengeStatus | null;
    };

type EvidenceCountsRow = {
  closed_trade_count: string | number;
  reflected_trade_count: string | number;
};

type ChallengeIdentityRow = {
  locale: string;
  challenge_participation: boolean;
  rewarded_at: Date | string | null;
};

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function assertContext(
  context: AvailableTenantPrincipalContext,
  scope: "community:challenge:read" | "community:challenge:write",
): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes(scope)
  ) {
    throw new Error("community_challenge_context_invalid");
  }
}

function assertAudit(
  context: AvailableTenantPrincipalContext,
  audit: JournalChallengeClaimAudit,
): void {
  if (
    audit.tenantId !== context.tenantId ||
    audit.actorType !== "student" ||
    audit.actorId !== context.principalId
  ) {
    throw new Error("community_challenge_audit_context_mismatch");
  }
}

function rewardKey(weekKey: string): string {
  return `challenge:journal-reflection:${weekKey}`;
}

function commandType(weekKey: string): string {
  return `community_challenge:journal-reflection:${weekKey}`;
}

async function loadIdentity(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  cycle: ChallengeCycle,
  lock = false,
): Promise<ChallengeIdentityRow | null> {
  const selected = await client.query<ChallengeIdentityRow>(
    `SELECT student.locale,
            profile.challenge_participation,
            reward.awarded_at
       FROM academy_public_profiles profile
       JOIN academy_students student
         ON student.id = profile.student_id
       JOIN platform_principal_bindings binding
         ON binding.tenant_id = profile.tenant_id
        AND binding.workspace_id = profile.workspace_id
        AND binding.principal_type = profile.principal_type
        AND binding.principal_id = profile.principal_id
        AND binding.status = 'active'
       LEFT JOIN academy_reward_ledger reward
         ON reward.student_id = profile.student_id
        AND reward.locale = CASE WHEN student.locale = 'en' THEN 'en' ELSE 'fa' END
        AND reward.reward_key = $4
      WHERE profile.tenant_id = $1
        AND profile.workspace_id = $2
        AND profile.principal_type = 'student'
        AND profile.principal_id = $3
      LIMIT 1${lock ? " FOR UPDATE OF profile" : ""}`,
    [context.tenantId, context.workspaceId, context.principalId, rewardKey(cycle.weekKey)],
  );
  return selected.rows[0] ?? null;
}

async function loadEvidenceCounts(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  cycle: ChallengeCycle,
): Promise<{ closedTradeCount: number; reflectedTradeCount: number }> {
  const selected = await client.query<EvidenceCountsRow>(
    `WITH closed_trade_evidence AS (
       SELECT event.attempt_id,
              event.student_id,
              event.payload->'trade'->>'id' AS trade_id,
              COALESCE(
                NULLIF(event.payload->'trade'->>'closedAt', '')::timestamptz,
                event.created_at
              ) AS closed_at
         FROM academy_trading_arena_execution_events event
        WHERE event.student_id = $1::uuid
          AND event.event_type = 'arena.position_closed'
          AND jsonb_typeof(event.payload->'trade') = 'object'
       UNION ALL
       SELECT event.attempt_id,
              event.student_id,
              closed_id.trade_id,
              event.created_at AS closed_at
         FROM academy_trading_arena_execution_events event
         CROSS JOIN LATERAL jsonb_array_elements_text(
           CASE
             WHEN jsonb_typeof(event.payload->'closedTradeIds') = 'array'
             THEN event.payload->'closedTradeIds'
             ELSE '[]'::jsonb
           END
         ) AS closed_id(trade_id)
        WHERE event.student_id = $1::uuid
          AND event.event_type = 'arena.market_refreshed'
       UNION ALL
       SELECT event.attempt_id,
              event.student_id,
              closed_id.trade_id,
              event.created_at AS closed_at
         FROM academy_trading_arena_execution_events event
         CROSS JOIN LATERAL jsonb_array_elements_text(
           CASE
             WHEN jsonb_typeof(event.payload->'autoClosedTradeIds') = 'array'
             THEN event.payload->'autoClosedTradeIds'
             ELSE '[]'::jsonb
           END
         ) AS closed_id(trade_id)
        WHERE event.student_id = $1::uuid
          AND event.event_type = 'arena.limit_order_filled'
     ), bounded_closed AS (
       SELECT DISTINCT attempt_id, student_id, trade_id
         FROM closed_trade_evidence
        WHERE trade_id IS NOT NULL
          AND trade_id <> ''
          AND closed_at >= $2::timestamptz
          AND closed_at < $3::timestamptz
     )
     SELECT COUNT(*)::int AS closed_trade_count,
            COUNT(*) FILTER (WHERE reflection.id IS NOT NULL)::int AS reflected_trade_count
       FROM bounded_closed closed
       LEFT JOIN academy_trading_arena_reflections reflection
         ON reflection.student_id = closed.student_id
        AND reflection.attempt_id = closed.attempt_id
        AND reflection.closed_trade_id = closed.trade_id`,
    [context.principalId, cycle.startsAt, cycle.endsAt],
  );
  return {
    closedTradeCount: number(selected.rows[0]?.closed_trade_count),
    reflectedTradeCount: number(selected.rows[0]?.reflected_trade_count),
  };
}

function buildStatus(input: {
  cycle: ChallengeCycle;
  identity: ChallengeIdentityRow;
  counts: { closedTradeCount: number; reflectedTradeCount: number };
}): JournalChallengeStatus {
  const active = input.cycle.challenge.id === JOURNAL_REFLECTION_CHALLENGE_ID;
  const reflectionRate = input.counts.closedTradeCount > 0
    ? input.counts.reflectedTradeCount / input.counts.closedTradeCount
    : 0;
  const score = Math.max(0, Math.min(100, Math.round(reflectionRate * 100)));
  const completed = Boolean(input.identity.rewarded_at);
  return {
    challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
    weekKey: input.cycle.weekKey,
    startsAt: input.cycle.startsAt,
    endsAt: input.cycle.endsAt,
    active,
    consentEnabled: Boolean(input.identity.challenge_participation),
    closedTradeCount: input.counts.closedTradeCount,
    reflectedTradeCount: input.counts.reflectedTradeCount,
    reflectionRate,
    score,
    minTrades: JOURNAL_REFLECTION_MIN_TRADES,
    minRate: JOURNAL_REFLECTION_MIN_RATE,
    eligible:
      active &&
      Boolean(input.identity.challenge_participation) &&
      input.counts.closedTradeCount >= JOURNAL_REFLECTION_MIN_TRADES &&
      reflectionRate >= JOURNAL_REFLECTION_MIN_RATE,
    completed,
    rewardedAt: iso(input.identity.rewarded_at),
    reward: {
      xp: JOURNAL_REFLECTION_REWARD_XP,
      badge: JOURNAL_REFLECTION_BADGE,
    },
  };
}

async function loadStatusTx(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  now: Date,
  lock = false,
): Promise<{ status: JournalChallengeStatus; locale: "fa" | "en" } | null> {
  const cycle = getChallengeCycle(now);
  const identity = await loadIdentity(client, context, cycle, lock);
  if (!identity) return null;
  const counts = await loadEvidenceCounts(client, context, cycle);
  return {
    status: buildStatus({ cycle, identity, counts }),
    locale: identity.locale === "en" ? "en" : "fa",
  };
}

export async function loadJournalChallengeStatus(input: {
  context: AvailableTenantPrincipalContext;
  now?: Date;
}): Promise<JournalChallengeLoadResult> {
  assertContext(input.context, "community:challenge:read");
  try {
    const result = await withDb((client) =>
      loadStatusTx(client, input.context, input.now ?? new Date()),
    );
    if (!result.enabled || !result.value) return { available: false, status: null };
    return { available: true, status: result.value.status };
  } catch (error) {
    logger.error("[community-challenge] status load failed", {
      tenantId: input.context.tenantId,
      error: String(error),
    });
    return { available: false, status: null };
  }
}

export async function claimJournalChallenge(input: {
  context: AvailableTenantPrincipalContext;
  challengeId: string;
  weekKey: string;
  idempotencyKey: string;
  audit: JournalChallengeClaimAudit;
  now?: Date;
}): Promise<JournalChallengeClaimResult> {
  assertContext(input.context, "community:challenge:write");
  assertAudit(input.context, input.audit);
  const now = input.now ?? new Date();
  const cycle = getChallengeCycle(now);
  if (
    input.challengeId !== JOURNAL_REFLECTION_CHALLENGE_ID ||
    input.weekKey !== cycle.weekKey
  ) {
    return { ok: false, reason: "inactive", status: null };
  }

  try {
    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('community_journal_challenge'),
           hashtext($1)
         )`,
        [`${input.context.tenantId}:${input.context.principalId}:${cycle.weekKey}`],
      );
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('academy_learning_idempotency'),
           hashtext($1)
         )`,
        [`${input.context.principalId}:${input.idempotencyKey}`],
      );

      const request = {
        challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
        weekKey: cycle.weekKey,
      };
      const existing = await readLearningCommand<{
        status: JournalChallengeStatus;
        progress: Record<string, unknown>;
        progressRevision: number;
      }>(
        client,
        input.context.principalId,
        commandType(cycle.weekKey),
        request,
        input.idempotencyKey,
      );
      if (existing.idempotencyConflict) {
        return { ok: false as const, reason: "idempotency_conflict" as const, status: null };
      }
      if (existing.response) {
        return {
          ok: true as const,
          changed: false,
          replayed: true,
          ...existing.response,
        };
      }

      const loaded = await loadStatusTx(client, input.context, now, true);
      if (!loaded) {
        return { ok: false as const, reason: "unavailable" as const, status: null };
      }
      if (!loaded.status.active) {
        return { ok: false as const, reason: "inactive" as const, status: loaded.status };
      }
      if (!loaded.status.consentEnabled) {
        return { ok: false as const, reason: "consent_required" as const, status: loaded.status };
      }
      if (!loaded.status.eligible && !loaded.status.completed) {
        return { ok: false as const, reason: "not_eligible" as const, status: loaded.status };
      }

      const inserted = loaded.status.completed
        ? false
        : await awardAcademyReward(client, {
            studentId: input.context.principalId,
            locale: loaded.locale,
            rewardKey: rewardKey(cycle.weekKey),
            rewardType: "community_challenge",
            sourceType: "arena_reflection_challenge",
            sourceId: `${JOURNAL_REFLECTION_CHALLENGE_ID}:${cycle.weekKey}`,
            xp: JOURNAL_REFLECTION_REWARD_XP,
            badgeCode: JOURNAL_REFLECTION_BADGE,
            metadata: {
              weekKey: cycle.weekKey,
              closedTradeCount: loaded.status.closedTradeCount,
              reflectedTradeCount: loaded.status.reflectedTradeCount,
              score: loaded.status.score,
              authority: "server_arena_reflection_challenge_v1",
            },
          });

      if (inserted) {
        await client.query(
          `INSERT INTO academy_student_events (student_id, event_type, payload)
           VALUES ($1::uuid, 'community_challenge_completed', $2::jsonb)`,
          [
            input.context.principalId,
            JSON.stringify({
              challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
              weekKey: cycle.weekKey,
              closedTradeCount: loaded.status.closedTradeCount,
              reflectedTradeCount: loaded.status.reflectedTradeCount,
              score: loaded.status.score,
              rewardXp: JOURNAL_REFLECTION_REWARD_XP,
              badgeCode: JOURNAL_REFLECTION_BADGE,
              authority: "server_arena_reflection_challenge_v1",
            }),
          ],
        );
        await writeSensitiveMutationAuditTx(client, {
          ...input.audit,
          action: "community.challenge.reward.claim",
          resourceType: "community_challenge",
          resourceId: `${JOURNAL_REFLECTION_CHALLENGE_ID}:${cycle.weekKey}`,
          outcome: "success",
          metadata: {
            challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
            weekKey: cycle.weekKey,
            closedTradeCount: loaded.status.closedTradeCount,
            reflectedTradeCount: loaded.status.reflectedTradeCount,
            score: loaded.status.score,
            rewardXp: JOURNAL_REFLECTION_REWARD_XP,
            badgeCode: JOURNAL_REFLECTION_BADGE,
          },
        });
      }

      const projection = await refreshAcademyProgressProjection(
        client,
        input.context.principalId,
        loaded.locale,
      );
      const finalLoaded = await loadStatusTx(client, input.context, now, false);
      if (!finalLoaded) throw new Error("community_challenge_status_missing_after_claim");
      const response = {
        status: finalLoaded.status,
        progress: projection.state as unknown as Record<string, unknown>,
        progressRevision: projection.revision,
      };
      await storeLearningCommand(client, {
        studentId: input.context.principalId,
        commandType: commandType(cycle.weekKey),
        requestHash: existing.requestHash,
        idempotencyKey: input.idempotencyKey,
        result: response,
      });
      return {
        ok: true as const,
        changed: inserted,
        replayed: false,
        ...response,
      };
    });
    if (!result.enabled) {
      return { ok: false, reason: "unavailable", status: null };
    }
    return result.value;
  } catch (error) {
    logger.error("[community-challenge] claim failed", {
      tenantId: input.context.tenantId,
      error: String(error),
    });
    return { ok: false, reason: "unavailable", status: null };
  }
}
