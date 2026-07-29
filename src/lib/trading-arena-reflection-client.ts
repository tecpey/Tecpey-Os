export const ARENA_REFLECTION_TAG_OPTIONS = [
  "late-entry",
  "early-exit",
  "oversized-position",
  "missing-stop-loss",
  "moved-stop-loss",
  "fomo-entry",
  "revenge-trade",
  "ignored-plan",
  "poor-risk-reward",
  "overtrading",
  "none",
] as const;

export type ArenaReflectionTag = typeof ARENA_REFLECTION_TAG_OPTIONS[number];

export type ArenaReflectionDraft = {
  decisionReview: string;
  learnedLesson: string;
  emotionalReview: string;
  mistakeTags: ArenaReflectionTag[];
  nextActionCommitment: string;
};

export type ArenaReflectionView = {
  id: string;
  attemptId: string;
  closedTradeId: string;
  revision: number;
  decisionReview: string;
  learnedLesson: string;
  emotionalReview: string;
  mistakeTags: ArenaReflectionTag[];
  nextActionCommitment: string | null;
  evidence: {
    asset: "BTC" | "ETH";
    realizedPnl: string;
    realizedPnlRate: string;
    closureReason: "manual" | "stop-loss" | "take-profit";
    closedAt: string;
    mentorFlags: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type ArenaReflectionRequest = {
  attemptId: string;
  closedTradeId: string;
  expectedRevision: number;
  decisionReview: string;
  learnedLesson: string;
  emotionalReview: string;
  mistakeTags: ArenaReflectionTag[];
  nextActionCommitment: string;
};

export type ArenaPendingReflectionIdentity = {
  attemptId: string;
  closedTradeId: string;
  expectedRevision: number;
  fingerprint: string;
  idempotencyKey: string;
  request: ArenaReflectionRequest;
};

export type ArenaReflectionIdentityDecision =
  | { kind: "ready"; identity: ArenaPendingReflectionIdentity; reused: boolean }
  | { kind: "blocked"; identity: ArenaPendingReflectionIdentity };

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function amount(value: unknown): string | null {
  return typeof value === "string" && value.length <= 100 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    ? value
    : null;
}

function tags(value: unknown): ArenaReflectionTag[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
  const parsed = value.filter((item): item is ArenaReflectionTag =>
    typeof item === "string" && ARENA_REFLECTION_TAG_OPTIONS.includes(item as ArenaReflectionTag));
  if (parsed.length !== value.length || new Set(parsed).size !== parsed.length) return null;
  if (parsed.includes("none") && parsed.length !== 1) return null;
  return parsed;
}

function mentorFlags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 80)) return null;
  return value as string[];
}

export function parseArenaReflection(value: unknown): ArenaReflectionView | null {
  const raw = record(value);
  const evidence = record(raw?.evidence);
  if (!raw || !evidence) return null;
  const revision = Number(raw.revision);
  const mistakeTags = tags(raw.mistakeTags);
  const parsedFlags = mentorFlags(evidence.mentorFlags);
  const closureReason = evidence.closureReason;
  const asset = evidence.asset;
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(raw.updatedAt);
  const closedAt = timestamp(evidence.closedAt);
  const realizedPnl = amount(evidence.realizedPnl);
  const realizedPnlRate = amount(evidence.realizedPnlRate);
  if (
    !text(raw.id, 120) || !text(raw.attemptId, 120) || !text(raw.closedTradeId, 160) ||
    !Number.isSafeInteger(revision) || revision < 1 ||
    !text(raw.decisionReview, 4_000) || !text(raw.learnedLesson, 4_000) ||
    !text(raw.emotionalReview, 2_000) || !mistakeTags || !parsedFlags ||
    (asset !== "BTC" && asset !== "ETH") ||
    (closureReason !== "manual" && closureReason !== "stop-loss" && closureReason !== "take-profit") ||
    !closedAt || !createdAt || !updatedAt || !realizedPnl || !realizedPnlRate
  ) return null;
  if (raw.nextActionCommitment !== null && !text(raw.nextActionCommitment, 2_000)) return null;

  return {
    id: raw.id as string,
    attemptId: raw.attemptId as string,
    closedTradeId: raw.closedTradeId as string,
    revision,
    decisionReview: raw.decisionReview as string,
    learnedLesson: raw.learnedLesson as string,
    emotionalReview: raw.emotionalReview as string,
    mistakeTags,
    nextActionCommitment: raw.nextActionCommitment as string | null,
    evidence: {
      asset,
      realizedPnl,
      realizedPnlRate,
      closureReason,
      closedAt,
      mentorFlags: parsedFlags,
    },
    createdAt,
    updatedAt,
  };
}

function source(value: unknown): UnknownRecord | null {
  const root = record(value);
  if (!root) return null;
  return record(root.details) ?? root;
}

export function parseArenaReflectionList(value: unknown): {
  attemptId: string;
  reflections: ArenaReflectionView[];
} | null {
  const raw = source(value);
  const attemptId = text(raw?.attemptId, 120);
  if (!raw || !attemptId || !Array.isArray(raw.reflections)) return null;
  const reflections = raw.reflections.map(parseArenaReflection);
  if (reflections.some((item) => item === null)) return null;
  if (reflections.some((item) => item?.attemptId !== attemptId)) return null;
  return { attemptId, reflections: reflections as ArenaReflectionView[] };
}

export function parseArenaReflectionMutation(value: unknown): {
  attemptId: string;
  reflection: ArenaReflectionView;
  idempotentReplay: boolean;
} | null {
  const raw = source(value);
  const attemptId = text(raw?.attemptId, 120);
  const reflection = parseArenaReflection(raw?.reflection);
  if (!raw || !attemptId || !reflection || reflection.attemptId !== attemptId) return null;
  return { attemptId, reflection, idempotentReplay: raw.idempotentReplay === true };
}

export function shouldApplyArenaReflectionMutation(input: {
  current: ArenaReflectionView | null;
  incoming: ArenaReflectionView;
  responseSequence: number;
  latestResponseSequence: number;
}): boolean {
  return input.responseSequence === input.latestResponseSequence &&
    (!input.current || input.incoming.revision >= input.current.revision);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as UnknownRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

export function createArenaReflectionIdempotencyKey(entropy?: string): string {
  const generated = entropy ?? globalThis.crypto?.randomUUID?.();
  if (!generated) throw new Error("arena_reflection_idempotency_entropy_unavailable");
  const safe = generated.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
  const key = `arena-reflection:${safe}`;
  if (safe.length < 8 || key.length > 120) throw new Error("arena_reflection_idempotency_entropy_invalid");
  return key;
}

export function reflectionRequestFromDraft(input: {
  attemptId: string;
  closedTradeId: string;
  expectedRevision: number;
  draft: ArenaReflectionDraft;
}): ArenaReflectionRequest {
  return {
    attemptId: input.attemptId,
    closedTradeId: input.closedTradeId,
    expectedRevision: input.expectedRevision,
    decisionReview: input.draft.decisionReview,
    learnedLesson: input.draft.learnedLesson,
    emotionalReview: input.draft.emotionalReview,
    mistakeTags: [...input.draft.mistakeTags].sort(),
    nextActionCommitment: input.draft.nextActionCommitment,
  };
}

export function resolveArenaReflectionIdentity(input: {
  pending: ArenaPendingReflectionIdentity | null;
  attemptId: string;
  closedTradeId: string;
  expectedRevision: number;
  draft: ArenaReflectionDraft;
  entropy?: string;
}): ArenaReflectionIdentityDecision {
  const request = reflectionRequestFromDraft(input);
  const fingerprint = canonical(request);
  if (input.pending) {
    if (
      input.pending.attemptId !== input.attemptId ||
      input.pending.closedTradeId !== input.closedTradeId ||
      input.pending.fingerprint !== fingerprint
    ) {
      return { kind: "blocked", identity: input.pending };
    }
    return { kind: "ready", identity: input.pending, reused: true };
  }
  return {
    kind: "ready",
    reused: false,
    identity: {
      attemptId: input.attemptId,
      closedTradeId: input.closedTradeId,
      expectedRevision: input.expectedRevision,
      fingerprint,
      idempotencyKey: createArenaReflectionIdempotencyKey(input.entropy),
      request,
    },
  };
}

export function reflectionDraftFromAuthoritative(
  reflection: ArenaReflectionView | null,
): ArenaReflectionDraft {
  return reflection
    ? {
        decisionReview: reflection.decisionReview,
        learnedLesson: reflection.learnedLesson,
        emotionalReview: reflection.emotionalReview,
        mistakeTags: [...reflection.mistakeTags],
        nextActionCommitment: reflection.nextActionCommitment ?? "",
      }
    : {
        decisionReview: "",
        learnedLesson: "",
        emotionalReview: "",
        mistakeTags: ["none"],
        nextActionCommitment: "",
      };
}

export function arenaReflectionUiError(error: unknown, status?: number): string {
  const code = typeof error === "string" ? error : "arena_reflections_unavailable";
  const messages: Record<string, string> = {
    academy_profile_required: "برای ثبت ژورنال ابتدا پروفایل آکادمی را کامل کنید.",
    invalid_arena_reflection: "همه بخش‌های ضروری بازتاب را کامل و دوباره بررسی کنید.",
    idempotency_key_required: "شناسه امن ذخیره‌سازی ساخته نشد؛ صفحه را تازه‌سازی کنید.",
    idempotency_key_reused: "شناسه درخواست قبلی برای محتوای دیگری استفاده شده است؛ ژورنال را تازه‌سازی کنید.",
    revision_conflict: "این بازتاب روی دستگاه یا نشست دیگری تغییر کرده است. نسخه سرور بازیابی شد و متن فعلی شما حفظ شد.",
    arena_attempt_not_found: "فرصت معاملاتی متعلق به این حساب پیدا نشد.",
    arena_closed_trade_not_found: "معامله بسته‌شده در state معتبر سرور پیدا نشد.",
    rate_limited: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
    forbidden: "درخواست ذخیره‌سازی معتبر نیست. صفحه را تازه‌سازی کنید.",
    arena_reflections_unavailable: "ژورنال سروری موقتاً در دسترس نیست؛ متن شما در همین صفحه حفظ شده است.",
  };
  return messages[code] ?? (status && status >= 500
    ? messages.arena_reflections_unavailable
    : "ذخیره بازتاب انجام نشد؛ اطلاعات را بررسی و دوباره تلاش کنید.");
}
