"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Flame,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  Shield,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  communityChallengeUiError,
  createCommunityChallengeIdempotencyKey,
  parseCommunityConsentMutationPayload,
  parseCommunityOwnedProfilePayload,
  parseJournalChallengeClaimPayload,
  parseJournalChallengeStatusPayload,
  type CommunityOwnedProfileClient,
  type JournalChallengeStatusClient,
} from "@/lib/community-challenge-client";
import {
  DIFFICULTY_LABEL,
  FOCUS_LABEL,
  JOURNAL_REFLECTION_CHALLENGE_ID as _UNUSED,
  WEEKLY_CHALLENGES,
  getChallengeCycle,
  getNextChallenge,
  type Challenge,
} from "@/lib/community-challenges";

const JOURNAL_CHALLENGE_ID = "journal-reflection-week";

const DIFFICULTY_COLOR = {
  beginner: "text-emerald-300",
  intermediate: "text-amber-300",
  advanced: "text-red-300",
};

function errorCode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid_response";
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : "invalid_response";
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function faDate(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
}

function ChallengePreviewCard({
  challenge,
  current = false,
}: {
  challenge: Challenge;
  current?: boolean;
}) {
  return (
    <article className={`rounded-[24px] border p-5 ${current
      ? "border-amber-400/25 bg-amber-400/5"
      : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-black ${DIFFICULTY_COLOR[challenge.difficulty]}`}>
              {DIFFICULTY_LABEL[challenge.difficulty]}
            </span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-black text-violet-300">
              {FOCUS_LABEL[challenge.focus]}
            </span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <Clock className="h-3 w-3" />
              {challenge.estimatedMinutes} دقیقه
            </span>
          </div>
          <h2 className="text-lg font-black text-white">{challenge.title}</h2>
        </div>
        <Lock className="h-5 w-5 shrink-0 text-slate-500" />
      </div>

      <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
        {challenge.objective}
      </p>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-black text-slate-500">قوانین تمرین:</p>
        {challenge.rules.map((rule, index) => (
          <div key={rule} className="flex items-start gap-2 text-xs font-bold text-slate-400">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-400/20 text-[9px] font-black text-violet-300">
              {index + 1}
            </span>
            {rule}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold text-emerald-200">
          {challenge.responsibleTradingNote}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-500/20 bg-slate-500/5 p-3 text-xs font-bold leading-6 text-slate-400">
        {current
          ? "این تمرین در چرخه فعلی نمایش داده می‌شود، اما تکمیل، امتیاز، XP و Badge آن تا ساخت Authority اختصاصی غیرفعال است."
          : "پیش‌نمایش کاتالوگ؛ هیچ تکمیل یا پاداش رسمی برای این Challenge صادر نمی‌شود."}
      </div>
    </article>
  );
}

function OfficialJournalChallengeCard({
  challenge,
  status,
  claimBusy,
  onClaim,
}: {
  challenge: Challenge;
  status: JournalChallengeStatusClient;
  claimBusy: boolean;
  onClaim: () => void;
}) {
  const progressWidth = `${Math.max(0, Math.min(100, status.score))}%`;
  const canClaim = status.active && status.consentEnabled && status.eligible && !status.completed;

  return (
    <article className="rounded-[28px] border border-violet-400/30 bg-violet-400/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-200">
              Authority رسمی سرور
            </span>
            <span className={`text-xs font-black ${DIFFICULTY_COLOR[challenge.difficulty]}`}>
              {DIFFICULTY_LABEL[challenge.difficulty]}
            </span>
            <span className="text-xs font-black text-violet-300">
              {FOCUS_LABEL[challenge.focus]}
            </span>
          </div>
          <h2 className="text-xl font-black text-white">{challenge.title}</h2>
          <p className="mt-2 text-xs font-bold text-slate-500">
            چرخه {status.weekKey} · {faDate(status.startsAt)} تا {faDate(status.endsAt)}
          </p>
        </div>
        {status.completed ? (
          <CheckCircle2 className="h-7 w-7 text-emerald-300" />
        ) : (
          <Award className="h-7 w-7 text-amber-300" />
        )}
      </div>

      <p className="mt-4 text-sm font-bold leading-7 text-slate-200">
        {challenge.objective}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-[10px] font-black text-slate-500">معاملات بسته‌شده</p>
          <p className="mt-1 text-xl font-black text-white">{status.closedTradeCount}</p>
          <p className="mt-1 text-[10px] font-bold text-slate-500">حداقل {status.minTrades}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-[10px] font-black text-slate-500">Reflection معتبر</p>
          <p className="mt-1 text-xl font-black text-white">{status.reflectedTradeCount}</p>
          <p className="mt-1 text-[10px] font-bold text-slate-500">متصل به Trade ID</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <p className="text-[10px] font-black text-slate-500">پوشش ژورنال</p>
          <p className="mt-1 text-xl font-black text-white">{status.score}٪</p>
          <p className="mt-1 text-[10px] font-bold text-slate-500">حداقل {Math.round(status.minRate * 100)}٪</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3">
          <p className="text-[10px] font-black text-amber-300">پاداش Exactly-Once</p>
          <p className="mt-1 text-xl font-black text-amber-100">+{status.reward.xp} XP</p>
          <p className="mt-1 text-[10px] font-bold text-amber-200/70">Badge: استاد ژورنال</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`پوشش Reflection ${status.score} درصد`}>
        <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: progressWidth }} />
      </div>

      <div className="mt-5 space-y-2">
        {challenge.rules.map((rule, index) => (
          <div key={rule} className="flex items-start gap-2 text-xs font-bold leading-6 text-slate-300">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-400/20 text-[9px] font-black text-violet-200">
              {index + 1}
            </span>
            {rule}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold leading-6 text-emerald-100">
          {challenge.responsibleTradingNote}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <div className="text-xs font-bold leading-6 text-slate-400">
          {!status.active && "این Challenge در چرخه جاری فعال نیست."}
          {status.active && !status.consentEnabled && "برای Claim، مشارکت حساب‌محور را فعال کنید."}
          {status.active && status.consentEnabled && !status.eligible && !status.completed &&
            "Evidence معتبر هنوز حداقل ۳ معامله و پوشش ۸۰٪ را کامل نکرده است."}
          {status.completed && `پاداش در ${faDate(status.rewardedAt!)} ثبت شده است.`}
          {canClaim && "همه معیارهای سرور کامل است؛ پاداش آماده Claim است."}
        </div>
        {status.completed ? (
          <span className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-sm font-black text-emerald-100">
            <CheckCircle2 className="h-4 w-4" /> تکمیل و ثبت شد
          </span>
        ) : (
          <button
            type="button"
            onClick={onClaim}
            disabled={!canClaim || claimBusy}
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            aria-busy={claimBusy}
          >
            {claimBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
            Claim پاداش رسمی
          </button>
        )}
      </div>
    </article>
  );
}

export function ChallengeCenter() {
  const cycle = useMemo(() => getChallengeCycle(), []);
  const nextChallenge = useMemo(() => getNextChallenge(), []);
  const currentChallenge = cycle.challenge;
  const otherChallenges = WEEKLY_CHALLENGES.filter(
    (challenge) => challenge.id !== currentChallenge.id && challenge.id !== nextChallenge.id,
  );
  const journalChallenge = WEEKLY_CHALLENGES.find((challenge) => challenge.id === JOURNAL_CHALLENGE_ID)!;

  const [profile, setProfile] = useState<CommunityOwnedProfileClient | null>(null);
  const [status, setStatus] = useState<JournalChallengeStatusClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [consentBusy, setConsentBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    let loadedProfile: CommunityOwnedProfileClient | null = null;
    try {
      const [profileResponse, challengeResponse] = await Promise.all([
        fetch("/api/community/profile", { credentials: "include", cache: "no-store" }),
        fetch("/api/community/profile?view=challenge-center", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const [profilePayload, challengePayload] = await Promise.all([
        json(profileResponse),
        json(challengeResponse),
      ]);
      if (!profileResponse.ok) throw new Error(errorCode(profilePayload));
      loadedProfile = parseCommunityOwnedProfilePayload(profilePayload);
      if (!loadedProfile) throw new Error("invalid_response");
      setProfile(loadedProfile);

      if (!challengeResponse.ok) throw new Error(errorCode(challengePayload));
      const parsedStatus = parseJournalChallengeStatusPayload(challengePayload);
      if (!parsedStatus) throw new Error("invalid_response");
      setStatus(parsedStatus);
    } catch (caught) {
      if (!loadedProfile) setProfile(null);
      setStatus(null);
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const reloadStatus = useCallback(async () => {
    const response = await fetch("/api/community/profile?view=challenge-center", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await json(response);
    if (!response.ok) throw new Error(errorCode(payload));
    const parsed = parseJournalChallengeStatusPayload(payload);
    if (!parsed) throw new Error("invalid_response");
    setStatus(parsed);
  }, []);

  const toggleParticipation = useCallback(async () => {
    if (!profile || consentBusy) return;
    setConsentBusy(true);
    setError(null);
    setNotice(null);
    const consent = {
      ...profile.consent,
      challengeParticipation: !profile.consent.challengeParticipation,
    };
    try {
      const response = await fetch("/api/community/profile", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createCommunityChallengeIdempotencyKey(),
        },
        body: JSON.stringify({
          expectedRevision: profile.revision,
          ...consent,
        }),
      });
      const payload = await json(response);
      if (!response.ok) {
        const code = errorCode(payload);
        if (code === "community_profile_revision_conflict") await loadInitial();
        throw new Error(code);
      }
      const updated = parseCommunityConsentMutationPayload(payload);
      if (!updated) throw new Error("invalid_response");
      setProfile(updated);
      await reloadStatus();
      setNotice(updated.consent.challengeParticipation
        ? "مشارکت حساب‌محور فعال شد. فقط Evidence معتبر سرور محاسبه می‌شود."
        : "مشارکت غیرفعال شد؛ هیچ Claim جدیدی مجاز نیست.");
    } catch (caught) {
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setConsentBusy(false);
    }
  }, [consentBusy, loadInitial, profile, reloadStatus]);

  const claimReward = useCallback(async () => {
    if (!status || claimBusy || !status.eligible || status.completed) return;
    setClaimBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/community/profile?view=journal-challenge", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createCommunityChallengeIdempotencyKey(),
        },
        body: JSON.stringify({
          challengeId: status.challengeId,
          weekKey: status.weekKey,
        }),
      });
      const payload = await json(response);
      if (!response.ok) throw new Error(errorCode(payload));
      const claimed = parseJournalChallengeClaimPayload(payload);
      if (!claimed) throw new Error("invalid_response");
      setStatus(claimed.challenge);
      setNotice(claimed.replayed
        ? "پاداش قبلاً ثبت شده بود؛ پاسخ Commit‌شده بازیابی شد."
        : "۲۰۰ XP و Badge استاد ژورنال با موفقیت در حساب ثبت شد.");
    } catch (caught) {
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
      try {
        await reloadStatus();
      } catch {
        // Preserve the truthful claim error; no browser fallback is allowed.
      }
    } finally {
      setClaimBusy(false);
    }
  }, [claimBusy, reloadStatus, status]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-slate-400">
        <LoaderCircle className="h-5 w-5 animate-spin" /> دریافت Evidence چالش از سرور
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">چالش‌های هفتگی</h1>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-400">
            فقط چالش بازتاب ژورنال دارای Authority رسمی است؛ سایر تمرین‌ها تا تکمیل Evidence اختصاصی، Preview و بدون پاداش می‌مانند.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10">
          <Flame className="h-6 w-6 text-orange-300" />
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <p className="text-xs font-bold leading-6 text-cyan-100/85">
          شمارش معاملات بسته‌شده و Reflectionها مستقیماً از Execution Event و Reflection معتبر PostgreSQL انجام می‌شود. سود، زیان و داده مرورگر در Eligibility نقشی ندارد.
        </p>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <p className="font-black text-amber-100">پروفایل معتبر جامعه در دسترس نیست</p>
          <p className="mt-2 text-sm font-bold leading-7 text-amber-100/70">
            بدون پروفایل حساب‌محور، مشارکت یا Claim انجام نمی‌شود.
          </p>
        </div>
      ) : (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-black text-white">مشارکت در چالش‌های رسمی</p>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
                این Consent در حساب و سرور ذخیره می‌شود و روی همه دستگاه‌ها یکسان است. فعال‌بودن آن به‌تنهایی امتیاز یا پاداش ایجاد نمی‌کند.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.consent.challengeParticipation}
              aria-busy={consentBusy}
              aria-label={profile.consent.challengeParticipation
                ? "غیرفعال کردن مشارکت در چالش‌ها"
                : "فعال کردن مشارکت در چالش‌ها"}
              onClick={() => void toggleParticipation()}
              disabled={consentBusy}
              className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-60"
            >
              {consentBusy ? (
                <LoaderCircle className="h-9 w-9 animate-spin text-cyan-300" />
              ) : profile.consent.challengeParticipation ? (
                <ToggleRight className="h-9 w-9 text-cyan-400" />
              ) : (
                <ToggleLeft className="h-9 w-9 text-slate-600" />
              )}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${profile.consent.challengeParticipation
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-slate-500/20 bg-slate-500/10 text-slate-400"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {profile.consent.challengeParticipation ? "Consent فعال" : "Consent غیرفعال"}
            </span>
            <Link
              href="/academy/trading-arena/journal"
              className="inline-flex items-center gap-1 text-xs font-black text-cyan-300 hover:text-cyan-200"
            >
              <BookOpenCheck className="h-4 w-4" /> ثبت Reflection معتبر
            </Link>
          </div>
        </section>
      )}

      {notice && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-xs font-bold leading-6 text-emerald-100" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 p-4" role="alert">
          <div className="flex items-start gap-2 text-xs font-bold leading-6 text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
          <button
            type="button"
            onClick={() => void loadInitial()}
            className="inline-flex items-center gap-1 rounded-xl border border-red-300/25 px-3 py-2 text-xs font-black text-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تلاش دوباره
          </button>
        </div>
      )}

      {status ? (
        <OfficialJournalChallengeCard
          challenge={journalChallenge}
          status={status}
          claimBusy={claimBusy}
          onClaim={() => void claimReward()}
        />
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/10 p-7 text-center">
          <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-300" />
          <p className="font-black text-slate-200">وضعیت رسمی چالش در دسترس نیست</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
            هیچ Count، Completion یا Reward مرورگری جایگزین نمی‌شود. Consent حساب همچنان جداگانه قابل مدیریت است.
          </p>
        </div>
      )}

      {currentChallenge.id !== JOURNAL_CHALLENGE_ID && (
        <section>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
            تمرین نمایشی چرخه {cycle.weekNumber}
          </p>
          <ChallengePreviewCard challenge={currentChallenge} current />
        </section>
      )}

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          هفته آینده — Preview
        </p>
        {nextChallenge.id === JOURNAL_CHALLENGE_ID ? (
          <ChallengePreviewCard challenge={nextChallenge} />
        ) : (
          <ChallengePreviewCard challenge={nextChallenge} />
        )}
      </section>

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          سایر تمرین‌های قفل‌شده
        </p>
        <div className="space-y-3">
          {otherChallenges
            .filter((challenge) => challenge.id !== JOURNAL_CHALLENGE_ID)
            .map((challenge) => (
              <ChallengePreviewCard key={challenge.id} challenge={challenge} />
            ))}
        </div>
      </section>
    </div>
  );
}
