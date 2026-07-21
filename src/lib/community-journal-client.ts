export type CommunityJournalMistakeTag =
  | "late-entry"
  | "early-exit"
  | "oversized-position"
  | "missing-stop-loss"
  | "moved-stop-loss"
  | "fomo-entry"
  | "revenge-trade"
  | "ignored-plan"
  | "poor-risk-reward"
  | "overtrading"
  | "none";

export type CommunityConsentClient = {
  profileVisibility: "private" | "public";
  leaderboardVisible: boolean;
  journalSharingEnabled: boolean;
  instructorReviewConsent: boolean;
  challengeParticipation: boolean;
  studyGroupDiscovery: boolean;
};

export type CommunityOwnedProfileClient = {
  revision: number;
  consent: CommunityConsentClient;
};

export type CommunityJournalEntryClient = {
  entryId: string;
  authorAlias: string;
  asset: "BTC" | "ETH";
  learnedLesson: string;
  mistakeTags: CommunityJournalMistakeTag[];
  nextActionCommitment: string | null;
  closedAt: string;
  sharedAt: string;
  isMine: boolean;
};

export type CommunityJournalFeedClient = {
  entries: CommunityJournalEntryClient[];
  nextCursor: string | null;
};

const TAGS = new Set<CommunityJournalMistakeTag>([
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
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function parseConsent(value: unknown): CommunityConsentClient | null {
  const raw = record(value);
  if (!raw) return null;
  if (
    (raw.profileVisibility !== "private" && raw.profileVisibility !== "public") ||
    typeof raw.leaderboardVisible !== "boolean" ||
    typeof raw.journalSharingEnabled !== "boolean" ||
    typeof raw.instructorReviewConsent !== "boolean" ||
    typeof raw.challengeParticipation !== "boolean" ||
    typeof raw.studyGroupDiscovery !== "boolean"
  ) return null;
  return {
    profileVisibility: raw.profileVisibility,
    leaderboardVisible: raw.leaderboardVisible,
    journalSharingEnabled: raw.journalSharingEnabled,
    instructorReviewConsent: raw.instructorReviewConsent,
    challengeParticipation: raw.challengeParticipation,
    studyGroupDiscovery: raw.studyGroupDiscovery,
  };
}

function parseProfile(value: unknown): CommunityOwnedProfileClient | null {
  const raw = record(value);
  if (!raw || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) {
    return null;
  }
  const consent = parseConsent(raw.consent);
  if (!consent) return null;
  return { revision: Number(raw.revision), consent };
}

export function parseCommunityOwnedProfilePayload(
  value: unknown,
): CommunityOwnedProfileClient | null {
  const raw = record(value);
  if (!raw || raw.ok !== true || raw.authenticated !== true) return null;
  return parseProfile(raw.profile);
}

export function parseCommunityConsentMutationPayload(
  value: unknown,
): CommunityOwnedProfileClient | null {
  const raw = record(value);
  if (!raw || raw.ok !== true) return null;
  return parseProfile(raw.profile);
}

function parseEntry(value: unknown): CommunityJournalEntryClient | null {
  const raw = record(value);
  if (!raw) return null;
  if (
    typeof raw.entryId !== "string" || raw.entryId.length < 8 || raw.entryId.length > 80 ||
    typeof raw.authorAlias !== "string" || raw.authorAlias.length < 3 || raw.authorAlias.length > 80 ||
    (raw.asset !== "BTC" && raw.asset !== "ETH") ||
    typeof raw.learnedLesson !== "string" || raw.learnedLesson.length < 1 || raw.learnedLesson.length > 1_200 ||
    !Array.isArray(raw.mistakeTags) || raw.mistakeTags.length < 1 || raw.mistakeTags.length > 5 ||
    raw.mistakeTags.some((tag) => typeof tag !== "string" || !TAGS.has(tag as CommunityJournalMistakeTag)) ||
    (raw.nextActionCommitment !== null && typeof raw.nextActionCommitment !== "string") ||
    (typeof raw.nextActionCommitment === "string" && raw.nextActionCommitment.length > 800) ||
    !validDate(raw.closedAt) || !validDate(raw.sharedAt) ||
    typeof raw.isMine !== "boolean"
  ) return null;
  const mistakeTags = raw.mistakeTags as CommunityJournalMistakeTag[];
  if (new Set(mistakeTags).size !== mistakeTags.length) return null;
  if (mistakeTags.includes("none") && mistakeTags.length !== 1) return null;
  return {
    entryId: raw.entryId,
    authorAlias: raw.authorAlias,
    asset: raw.asset,
    learnedLesson: raw.learnedLesson,
    mistakeTags,
    nextActionCommitment: raw.nextActionCommitment as string | null,
    closedAt: raw.closedAt,
    sharedAt: raw.sharedAt,
    isMine: raw.isMine,
  };
}

export function parseCommunityJournalFeedPayload(
  value: unknown,
): CommunityJournalFeedClient | null {
  const raw = record(value);
  if (!raw || raw.ok !== true || !Array.isArray(raw.entries)) return null;
  if (raw.nextCursor !== null && typeof raw.nextCursor !== "string") return null;
  const entries = raw.entries.map(parseEntry);
  if (entries.some((entry) => !entry)) return null;
  return {
    entries: entries as CommunityJournalEntryClient[],
    nextCursor: raw.nextCursor as string | null,
  };
}

export function createCommunityJournalIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("secure_random_unavailable");
  if (typeof cryptoApi.randomUUID === "function") {
    return `community-journal-${cryptoApi.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `community-journal-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function communityJournalUiError(error: unknown): string {
  switch (error) {
    case "academy_profile_required":
      return "برای مشاهده ژورنال‌های جامعه، ابتدا وارد حساب آکادمی شوید.";
    case "community_profile_revision_conflict":
      return "تنظیمات حریم خصوصی در دستگاه دیگری تغییر کرده است. اطلاعات دوباره بارگذاری شد.";
    case "idempotency_conflict":
      return "درخواست قبلی با محتوای متفاوت ثبت شده است. دوباره تلاش کنید.";
    case "rate_limited":
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
    case "community_profile_unavailable":
    case "community_journal_unavailable":
      return "مرجع سرور ژورنال‌ها موقتاً در دسترس نیست؛ هیچ داده مرورگری جایگزین نمی‌شود.";
    default:
      return "دریافت ژورنال‌های معتبر ممکن نشد. دوباره تلاش کنید.";
  }
}
