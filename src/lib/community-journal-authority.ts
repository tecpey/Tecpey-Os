import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cleanText } from "@/lib/student-cartax";
import {
  normalizeArenaReflectionMistakeTags,
  type ArenaReflectionMistakeTag,
} from "@/lib/trading-arena-reflections";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export type CommunityJournalCursor = {
  closedAt: string;
  reflectionId: string;
};

export type CommunityJournalEntry = {
  entryId: string;
  authorAlias: string;
  asset: "BTC" | "ETH";
  learnedLesson: string;
  mistakeTags: ArenaReflectionMistakeTag[];
  nextActionCommitment: string | null;
  closedAt: string;
  sharedAt: string;
  isMine: boolean;
};

export type CommunityJournalFeedPage = {
  entries: CommunityJournalEntry[];
  nextCursor: string | null;
};

export type CommunityJournalFeedResult =
  | { available: true; page: CommunityJournalFeedPage }
  | { available: false; page: null };

export type CommunityJournalCursorParseResult =
  | { ok: true; cursor: CommunityJournalCursor | null }
  | { ok: false; cursor: null };

type CommunityJournalRow = {
  reflection_id: string;
  public_profile_id: string;
  learned_lesson: string;
  mistake_tags: unknown;
  next_action_commitment: string | null;
  evidence_asset: "BTC" | "ETH";
  evidence_closed_at: Date | string;
  updated_at: Date | string;
  is_mine: boolean;
};

function stablePublicId(namespace: string, value: string, length: number): string {
  return createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(value)
    .digest("hex")
    .slice(0, length)
    .toUpperCase();
}

function iso(value: Date | string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("community_journal_timestamp_invalid");
  }
  return parsed.toISOString();
}

function assertContext(context: AvailableTenantPrincipalContext): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes("community:journal:read")
  ) {
    throw new Error("community_journal_context_invalid");
  }
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error("community_journal_limit_invalid");
  }
  return value;
}

function mapRow(row: CommunityJournalRow): CommunityJournalEntry {
  if (!UUID_RE.test(row.reflection_id) || !UUID_RE.test(row.public_profile_id)) {
    throw new Error("community_journal_identity_invalid");
  }
  if (row.evidence_asset !== "BTC" && row.evidence_asset !== "ETH") {
    throw new Error("community_journal_asset_invalid");
  }
  const learnedLesson = cleanText(row.learned_lesson, 1_200);
  if (!learnedLesson) throw new Error("community_journal_lesson_invalid");
  const mistakeTags = normalizeArenaReflectionMistakeTags(row.mistake_tags);
  if (!mistakeTags) throw new Error("community_journal_tags_invalid");
  const nextActionCommitment = row.next_action_commitment
    ? cleanText(row.next_action_commitment, 800) || null
    : null;

  return {
    entryId: `CJ-${stablePublicId("tecpey-community-journal-entry-v1", row.reflection_id, 24)}`,
    authorAlias: `یادگیرنده ${stablePublicId("tecpey-community-journal-author-v1", row.public_profile_id, 8)}`,
    asset: row.evidence_asset,
    learnedLesson,
    mistakeTags,
    nextActionCommitment,
    closedAt: iso(row.evidence_closed_at),
    sharedAt: iso(row.updated_at),
    isMine: Boolean(row.is_mine),
  };
}

export function encodeCommunityJournalCursor(cursor: CommunityJournalCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseCommunityJournalCursor(
  value: string | null,
): CommunityJournalCursorParseResult {
  if (!value) return { ok: true, cursor: null };
  if (value.length > 512) return { ok: false, cursor: null };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, cursor: null };
    }
    const raw = parsed as Record<string, unknown>;
    if (Object.keys(raw).some((key) => key !== "closedAt" && key !== "reflectionId")) {
      return { ok: false, cursor: null };
    }
    if (typeof raw.closedAt !== "string" || typeof raw.reflectionId !== "string") {
      return { ok: false, cursor: null };
    }
    const closedAt = iso(raw.closedAt);
    if (!UUID_RE.test(raw.reflectionId)) return { ok: false, cursor: null };
    return {
      ok: true,
      cursor: {
        closedAt,
        reflectionId: raw.reflectionId.toLowerCase(),
      },
    };
  } catch {
    return { ok: false, cursor: null };
  }
}

async function selectFeed(
  client: PoolClient,
  input: {
    context: AvailableTenantPrincipalContext;
    cursor: CommunityJournalCursor | null;
    limit: number;
  },
): Promise<CommunityJournalFeedPage> {
  const selected = await client.query<CommunityJournalRow>(
    `SELECT reflection.id::text AS reflection_id,
            profile.public_profile_id::text,
            reflection.learned_lesson,
            reflection.mistake_tags,
            reflection.next_action_commitment,
            reflection.evidence_asset,
            reflection.evidence_closed_at,
            reflection.updated_at,
            (profile.principal_id = $3) AS is_mine
       FROM academy_trading_arena_reflections reflection
       JOIN academy_public_profiles profile
         ON profile.student_id = reflection.student_id
       JOIN platform_principal_bindings binding
         ON binding.tenant_id = profile.tenant_id
        AND binding.workspace_id = profile.workspace_id
        AND binding.principal_type = profile.principal_type
        AND binding.principal_id = profile.principal_id
        AND binding.status = 'active'
      WHERE profile.tenant_id = $1
        AND profile.workspace_id = $2
        AND profile.principal_type = 'student'
        AND profile.journal_sharing_enabled = TRUE
        AND profile.consented_at IS NOT NULL
        AND profile.consent_version = 'community-profile-consent-v1'
        AND (
          $4::timestamptz IS NULL
          OR reflection.evidence_closed_at < $4::timestamptz
          OR (
            reflection.evidence_closed_at = $4::timestamptz
            AND reflection.id < $5::uuid
          )
        )
      ORDER BY reflection.evidence_closed_at DESC, reflection.id DESC
      LIMIT $6`,
    [
      input.context.tenantId,
      input.context.workspaceId,
      input.context.principalId,
      input.cursor?.closedAt ?? null,
      input.cursor?.reflectionId ?? null,
      input.limit + 1,
    ],
  );

  const hasMore = selected.rows.length > input.limit;
  const visibleRows = hasMore ? selected.rows.slice(0, input.limit) : selected.rows;
  const entries = visibleRows.map(mapRow);
  const last = visibleRows.at(-1);
  return {
    entries,
    nextCursor: hasMore && last
      ? encodeCommunityJournalCursor({
          closedAt: iso(last.evidence_closed_at),
          reflectionId: last.reflection_id,
        })
      : null,
  };
}

export async function listCommunityJournalFeed(input: {
  context: AvailableTenantPrincipalContext;
  cursor?: CommunityJournalCursor | null;
  limit?: number;
}): Promise<CommunityJournalFeedResult> {
  assertContext(input.context);
  const limit = boundedLimit(input.limit);
  try {
    const result = await withDb((client) =>
      selectFeed(client, {
        context: input.context,
        cursor: input.cursor ?? null,
        limit,
      }),
    );
    if (!result.enabled) return { available: false, page: null };
    return { available: true, page: result.value };
  } catch (error) {
    logger.error("[community-journal] feed load failed", {
      viewerFingerprint: stablePublicId(
        "tecpey-community-journal-viewer-v1",
        `${input.context.tenantId}\0${input.context.principalId}`,
        16,
      ),
      error: String(error),
    });
    return { available: false, page: null };
  }
}
