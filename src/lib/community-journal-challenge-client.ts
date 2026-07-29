export type CommunityChallengeConsent = {
  profileVisibility: "private" | "public";
  leaderboardVisible: boolean;
  journalSharingEnabled: boolean;
  instructorReviewConsent: boolean;
  challengeParticipation: boolean;
  studyGroupDiscovery: boolean;
};

export type CommunityChallengeOwnedProfile = {
  revision: number;
  consent: CommunityChallengeConsent;
};

export type OfficialJournalChallengeStateClient = {
  challengeId: "journal-reflection-week";
  challengeVersion: "journal-reflection-v1";
  cycle: {
    key: string;
    startsAt: string;
    endsAt: string;
  };
  consentEnabled: boolean;
  status: "not_joined" | "active" | "completed";
  enrollmentId: string | null;
  revision: number | null;
  startedAt: string | null;
  evaluatedAt: string | null;
  completedAt: string | null;
  progress: {
    eligibleClosedTrades: number;
    validReflections: number;
    coverageRate: number;
    minimumTrades: 3;
    requiredRate: 0.8;
    eligibleToComplete: boolean;
  };
  rewards: {
    xp: 0;
    badge: null;
    financialReward: null;
    status: "disabled";
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function nullableDate(value: unknown): value is string | null {
  return value === null || validDate(value);
}

function parseConsent(value: unknown): CommunityChallengeConsent | null {
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

function parseProfile(value: unknown): CommunityChallengeOwnedProfile | null {
  const raw = record(value);
  if (!raw || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) {
    return null;
  }
  const consent = parseConsent(raw.consent);
  if (!consent) return null;
  return { revision: Number(raw.revision), consent };
}

export function parseCommunityChallengeProfilePayload(
  value: unknown,
): CommunityChallengeOwnedProfile | null {
  const raw = record(value);
  if (!raw || raw.ok !== true || raw.authenticated !== true) return null;
  return parseProfile(raw.profile);
}

export function parseCommunityChallengeConsentMutationPayload(
  value: unknown,
): CommunityChallengeOwnedProfile | null {
  const raw = record(value);
  if (!raw || raw.ok !== true) return null;
  return parseProfile(raw.profile);
}

function parseState(value: unknown): OfficialJournalChallengeStateClient | null {
  const raw = record(value);
  const cycle = record(raw?.cycle);
  const progress = record(raw?.progress);
  const rewards = record(raw?.rewards);
  if (!raw || !cycle || !progress || !rewards) return null;
  if (
    raw.challengeId !== "journal-reflection-week" ||
    raw.challengeVersion !== "journal-reflection-v1" ||
    typeof cycle.key !== "string" || !/^[0-9]{4}-W[0-9]{2}$/.test(cycle.key) ||
    !validDate(cycle.startsAt) || !validDate(cycle.endsAt) ||
    new Date(cycle.endsAt).getTime() <= new Date(cycle.startsAt).getTime() ||
    typeof raw.consentEnabled !== "boolean" ||
    (raw.status !== "not_joined" && raw.status !== "active" && raw.status !== "completed") ||
    (raw.enrollmentId !== null && (typeof raw.enrollmentId !== "string" || raw.enrollmentId.length < 16)) ||
    (raw.revision !== null && (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1)) ||
    !nullableDate(raw.startedAt) || !nullableDate(raw.evaluatedAt) || !nullableDate(raw.completedAt) ||
    !Number.isSafeInteger(progress.eligibleClosedTrades) || Number(progress.eligibleClosedTrades) < 0 ||
    !Number.isSafeInteger(progress.validReflections) || Number(progress.validReflections) < 0 ||
    Number(progress.validReflections) > Number(progress.eligibleClosedTrades) ||
    typeof progress.coverageRate !== "number" || !Number.isFinite(progress.coverageRate) ||
    progress.coverageRate < 0 || progress.coverageRate > 1 ||
    progress.minimumTrades !== 3 || progress.requiredRate !== 0.8 ||
    typeof progress.eligibleToComplete !== "boolean" ||
    rewards.xp !== 0 || rewards.badge !== null || rewards.financialReward !== null ||
    rewards.status !== "disabled"
  ) return null;

  const eligibleClosedTrades = Number(progress.eligibleClosedTrades);
  const validReflections = Number(progress.validReflections);
  const expectedRate = eligibleClosedTrades === 0
    ? 0
    : Number((validReflections / eligibleClosedTrades).toFixed(6));
  const expectedEligible = eligibleClosedTrades >= 3 && validReflections * 5 >= eligibleClosedTrades * 4;
  if (Math.abs(Number(progress.coverageRate) - expectedRate) > 0.000001) return null;
  if (progress.eligibleToComplete !== expectedEligible) return null;

  if (raw.status === "not_joined") {
    if (
      raw.enrollmentId !== null || raw.revision !== null || raw.startedAt !== null ||
      raw.evaluatedAt !== null || raw.completedAt !== null ||
      eligibleClosedTrades !== 0 || validReflections !== 0
    ) return null;
  } else if (
    typeof raw.enrollmentId !== "string" ||
    !Number.isSafeInteger(raw.revision) ||
    !validDate(raw.startedAt)
  ) {
    return null;
  }

  if (raw.status === "completed") {
    if (!validDate(raw.completedAt) || !expectedEligible) return null;
  } else if (raw.completedAt !== null) {
    return null;
  }

  return {
    challengeId: raw.challengeId,
    challengeVersion: raw.challengeVersion,
    cycle: {
      key: cycle.key,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
    },
    consentEnabled: raw.consentEnabled,
    status: raw.status,
    enrollmentId: raw.enrollmentId as string | null,
    revision: raw.revision as number | null,
    startedAt: raw.startedAt as string | null,
    evaluatedAt: raw.evaluatedAt as string | null,
    completedAt: raw.completedAt as string | null,
    progress: {
      eligibleClosedTrades,
      validReflections,
      coverageRate: Number(progress.coverageRate),
      minimumTrades: 3,
      requiredRate: 0.8,
      eligibleToComplete: progress.eligibleToComplete,
    },
    rewards: {
      xp: 0,
      badge: null,
      financialReward: null,
      status: "disabled",
    },
  };
}

export function parseOfficialJournalChallengePayload(
  value: unknown,
): OfficialJournalChallengeStateClient | null {
  const raw = record(value);
  if (!raw || raw.ok !== true) return null;
  return parseState(raw.state);
}

export function createCommunityChallengeIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("secure_random_unavailable");
  if (typeof cryptoApi.randomUUID === "function") {
    return `community-challenge-${cryptoApi.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `community-challenge-${Array.from(bytes, (entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

export function communityChallengeUiError(error: unknown): string {
  switch (error) {
    case "academy_profile_required":
      return "برای شرکت در چالش رسمی، ابتدا وارد حساب آکادمی شوید.";
    case "challenge_consent_required":
      return "ابتدا رضایت حساب‌محور شرکت در چالش‌ها را فعال کنید.";
    case "challenge_cycle_conflict":
      return "چرخه هفتگی تغییر کرده است. وضعیت جدید از سرور بارگذاری شد.";
    case "challenge_not_joined":
      return "پیش از ارزیابی، باید در چالش همین چرخه عضو شوید.";
    case "community_profile_revision_conflict":
      return "تنظیمات حریم خصوصی در دستگاه دیگری تغییر کرده است؛ اطلاعات تازه بارگذاری شد.";
    case "idempotency_conflict":
      return "شناسه درخواست قبلاً با محتوای متفاوت استفاده شده است.";
    case "command_in_progress":
      return "همین درخواست در حال پردازش است. وضعیت را دوباره دریافت کنید.";
    case "rate_limited":
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
    case "community_profile_unavailable":
    case "community_challenge_unavailable":
      return "مرجع سرور چالش موقتاً در دسترس نیست؛ هیچ نتیجه مرورگری جایگزین نمی‌شود.";
    default:
      return "دریافت یا ثبت وضعیت رسمی چالش ممکن نشد.";
  }
}
