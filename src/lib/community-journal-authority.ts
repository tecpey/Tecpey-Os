import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  normalizeArenaReflectionMistakeTags,
  type ArenaReflectionMistakeTag,
} from "@/lib/trading-arena-reflections";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL = /[\u0000-\u001F\u007F]/g;
const PERSIAN_ARABIC_DIGITS = /[۰-۹٠-٩]/g;
const DIGIT_MAP: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:(?:\+98|0098|0)?9\d{9}|\+\d(?:[\d ()-]{6,13}\d))(?!\d)/g;
const ETH_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;
const BTC_ADDRESS_PATTERN = /\b(?:bc1[ac-hj-np-z02-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g;
const TRON_ADDRESS_PATTERN = /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const API_KEY_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|github_pat)_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi;
const PRIVATE_KEY_PATTERN = /\b(?:0x)?[a-fA-F0-9]{64}\b/g;
const WIF_PATTERN = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g;
const SOCIAL_LINK_PATTERN = /(?:https?:\/\/|www\.|t\.me\/)[^\s]+|(?<![\w@])@[A-Za-z0-9_]{4,32}\b/gi;
const SECRET_LABEL = /(?:seed\s*phrase|mnemonic|recovery\s*phrase|private\s*key|secret\s*key|password|passphrase|api[\s_-]*key|access[\s_-]*token|bearer|authorization|otp|2fa|one[\s_-]*time\s*code|session[\s_-]*token|عبارت\s*بازیابی|کلمات\s*بازیابی|کلید\s*خصوصی|رمز\s*عبور|پسورد|کد\s*(?:دو\s*مرحله|تأیید|یکبار\s*مصرف))/i;
const PUBLIC_SIGNAL_PATTERN = /(?:guaranteed\s+profit|buy\s+now|sell\s+now|join\s+(?:my|our)\s+(?:channel|group)|dm\s+me|contact\s+me|سیگنال\s*(?:خرید|فروش)?|سود\s*تضمین(?:ی|شده)|تضمین\s*سود|الان\s*(?:بخر|بفروش|لانگ|شورت)|حتما(?:ً)?\s*(?:بخر|بفروش)|عضو\s*(?:کانال|گروه)\s*(?:من|ما)\s*شو)/i;
const SECRET_PLACEHOLDER = "[متن حساس از نمایش عمومی حذف شد]";
const SAFETY_PLACEHOLDER = "[متن به‌دلیل سیاست ایمنی جامعه نمایش داده نشد]";

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
  author_seed: string;
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

function normalizePublicText(value: string, max: number): string {
  return value
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(CONTROL, " ")
    .replace(PERSIAN_ARABIC_DIGITS, (digit) => DIGIT_MAP[digit] ?? digit)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function minimizeCommunityJournalPublicText(
  value: string,
  max: number,
): string {
  let normalized = normalizePublicText(value, Math.max(max, 4_000));
  if (!normalized) return "";
  if (SECRET_LABEL.test(normalized)) return SECRET_PLACEHOLDER;
  if (PUBLIC_SIGNAL_PATTERN.test(normalized)) return SAFETY_PLACEHOLDER;
  for (const [pattern, replacement] of [
    [EMAIL_PATTERN, "[ایمیل حذف شد]"],
    [PHONE_PATTERN, "[شماره تماس حذف شد]"],
    [ETH_ADDRESS_PATTERN, "[آدرس کیف‌پول حذف شد]"],
    [BTC_ADDRESS_PATTERN, "[آدرس کیف‌پول حذف شد]"],
    [TRON_ADDRESS_PATTERN, "[آدرس کیف‌پول حذف شد]"],
    [JWT_PATTERN, "[توکن حذف شد]"],
    [API_KEY_PATTERN, "[کلید حذف شد]"],
    [BEARER_PATTERN, "[توکن حذف شد]"],
    [PRIVATE_KEY_PATTERN, "[کلید خصوصی حذف شد]"],
    [WIF_PATTERN, "[کلید خصوصی حذف شد]"],
    [SOCIAL_LINK_PATTERN, "[لینک یا شناسه ارتباطی حذف شد]"],
  ] as Array<[RegExp, string]>) {
    pattern.lastIndex = 0;
    normalized = normalized.replace(pattern, replacement);
    pattern.lastIndex = 0;
  }
  return normalized.replace(/\s+/g, " ").trim().slice(0, max);
}

function mapRow(row: CommunityJournalRow): CommunityJournalEntry {
  if (!UUID_RE.test(row.reflection_id) || !row.author_seed) {
    throw new Error("community_journal_identity_invalid");
  }
  if (row.evidence_asset !== "BTC" && row.evidence_asset !== "ETH") {
    throw new Error("community_journal_asset_invalid");
  }
  const learnedLesson = minimizeCommunityJournalPublicText(row.learned_lesson, 1_200);
  if (!learnedLesson) throw new Error("community_journal_lesson_invalid");
  const mistakeTags = normalizeArenaReflectionMistakeTags(row.mistake_tags);
  if (!mistakeTags) throw new Error("community_journal_tags_invalid");
  const nextActionCommitment = row.next_action_commitment
    ? minimizeCommunityJournalPublicText(row.next_action_commitment, 800) || null
    : null;

  return {
    entryId: `CJ-${stablePublicId("tecpey-community-journal-entry-v1", row.reflection_id, 24)}`,
    authorAlias: `یادگیرنده ${stablePublicId("tecpey-community-journal-author-v1", row.author_seed, 8)}`,
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
            profile.tenant_id || ':' || profile.principal_type || ':' || profile.principal_id AS author_seed,
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
