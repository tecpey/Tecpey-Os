import {
  parseCommunityConsentMutationPayload,
  parseCommunityOwnedProfilePayload,
  type CommunityOwnedProfileClient,
} from "@/lib/community-journal-client";

export type { CommunityOwnedProfileClient };

export type JournalChallengeStatusClient = {
  challengeId: "journal-reflection-week";
  weekKey: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  consentEnabled: boolean;
  closedTradeCount: number;
  reflectedTradeCount: number;
  reflectionRate: number;
  score: number;
  minTrades: 3;
  minRate: 0.8;
  eligible: boolean;
  completed: boolean;
  rewardedAt: string | null;
  reward: {
    xp: 200;
    badge: "journal-master";
  };
};

export type JournalChallengeClaimClient = {
  challenge: JournalChallengeStatusClient;
  progress: Record<string, unknown>;
  progressRevision: number;
  changed: boolean;
  replayed: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function date(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

export function parseJournalChallengeStatus(
  value: unknown,
): JournalChallengeStatusClient | null {
  const raw = record(value);
  const reward = record(raw?.reward);
  if (
    !raw ||
    raw.challengeId !== "journal-reflection-week" ||
    typeof raw.weekKey !== "string" ||
    !/^\d{4}-cycle-\d{2,3}$/.test(raw.weekKey) ||
    !date(raw.startsAt) ||
    !date(raw.endsAt) ||
    new Date(raw.startsAt).getTime() >= new Date(raw.endsAt).getTime() ||
    typeof raw.active !== "boolean" ||
    typeof raw.consentEnabled !== "boolean" ||
    !integer(raw.closedTradeCount, 0, 1_000_000) ||
    !integer(raw.reflectedTradeCount, 0, 1_000_000) ||
    Number(raw.reflectedTradeCount) > Number(raw.closedTradeCount) ||
    typeof raw.reflectionRate !== "number" ||
    !Number.isFinite(raw.reflectionRate) ||
    raw.reflectionRate < 0 ||
    raw.reflectionRate > 1 ||
    !integer(raw.score, 0, 100) ||
    raw.minTrades !== 3 ||
    raw.minRate !== 0.8 ||
    typeof raw.eligible !== "boolean" ||
    typeof raw.completed !== "boolean" ||
    (raw.rewardedAt !== null && !date(raw.rewardedAt)) ||
    !reward ||
    reward.xp !== 200 ||
    reward.badge !== "journal-master"
  ) {
    return null;
  }
  const expectedRate = raw.closedTradeCount === 0
    ? 0
    : raw.reflectedTradeCount / raw.closedTradeCount;
  if (Math.abs(raw.reflectionRate - expectedRate) > Number.EPSILON * 10) return null;
  if (raw.score !== Math.round(expectedRate * 100)) return null;
  if (raw.completed !== Boolean(raw.rewardedAt)) return null;
  return {
    challengeId: raw.challengeId,
    weekKey: raw.weekKey,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    active: raw.active,
    consentEnabled: raw.consentEnabled,
    closedTradeCount: raw.closedTradeCount,
    reflectedTradeCount: raw.reflectedTradeCount,
    reflectionRate: raw.reflectionRate,
    score: raw.score,
    minTrades: raw.minTrades,
    minRate: raw.minRate,
    eligible: raw.eligible,
    completed: raw.completed,
    rewardedAt: raw.rewardedAt as string | null,
    reward: {
      xp: reward.xp,
      badge: reward.badge,
    },
  };
}

export function parseJournalChallengeStatusPayload(
  value: unknown,
): JournalChallengeStatusClient | null {
  const raw = record(value);
  if (!raw || raw.ok !== true) return null;
  return parseJournalChallengeStatus(raw.challenge);
}

export function parseJournalChallengeClaimPayload(
  value: unknown,
): JournalChallengeClaimClient | null {
  const raw = record(value);
  if (
    !raw ||
    raw.ok !== true ||
    typeof raw.changed !== "boolean" ||
    typeof raw.replayed !== "boolean" ||
    !integer(raw.progressRevision, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }
  const challenge = parseJournalChallengeStatus(raw.challenge);
  const progress = record(raw.progress);
  if (!challenge || !progress) return null;
  return {
    challenge,
    progress,
    progressRevision: raw.progressRevision,
    changed: raw.changed,
    replayed: raw.replayed,
  };
}

export {
  parseCommunityConsentMutationPayload,
  parseCommunityOwnedProfilePayload,
};

export function createCommunityChallengeIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("secure_random_unavailable");
  if (typeof cryptoApi.randomUUID === "function") {
    return `community-challenge-${cryptoApi.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `community-challenge-${Array.from(bytes, (item) =>
    item.toString(16).padStart(2, "0")
  ).join("")}`;
}

export function communityChallengeUiError(value: unknown): string {
  switch (value) {
    case "academy_profile_required":
      return "برای مشاهده چالش رسمی، ابتدا وارد حساب آکادمی شوید.";
    case "community_challenge_inactive":
      return "این چالش در چرخه فعلی فعال نیست و پاداشی صادر نمی‌شود.";
    case "community_challenge_consent_required":
      return "برای Claim، ابتدا مشارکت حساب‌محور در چالش‌ها را فعال کنید.";
    case "community_challenge_not_eligible":
      return "شواهد معتبر آرنا هنوز معیار حداقل ۳ معامله و ۸۰٪ Reflection را کامل نکرده‌اند.";
    case "community_profile_revision_conflict":
      return "تنظیم مشارکت در دستگاه دیگری تغییر کرده است؛ وضعیت دوباره بارگذاری شد.";
    case "idempotency_conflict":
      return "کلید درخواست قبلی با محتوای دیگری استفاده شده است. درخواست جدید ایجاد کنید.";
    case "rate_limited":
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
    case "community_profile_unavailable":
    case "community_challenge_unavailable":
      return "مرجع سرور چالش موقتاً در دسترس نیست؛ هیچ نتیجه مرورگری جایگزین نمی‌شود.";
    default:
      return "دریافت یا ثبت چالش رسمی ممکن نشد. دوباره تلاش کنید.";
  }
}
