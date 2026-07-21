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
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  communityChallengeUiError,
  createCommunityChallengeIdempotencyKey,
  parseCommunityChallengeConsentMutationPayload,
  parseCommunityChallengeProfilePayload,
  parseOfficialJournalChallengePayload,
  type CommunityChallengeOwnedProfile,
  type OfficialJournalChallengeStateClient,
} from "@/lib/community-journal-challenge-client";
import {
  DIFFICULTY_LABEL,
  FOCUS_LABEL,
  OFFICIAL_PILOT_CHALLENGE,
  PREVIEW_ONLY_CHALLENGES,
  type Challenge,
} from "@/lib/community-challenges";

const DIFFICULTY_COLOR = {
  beginner: "text-emerald-300",
  intermediate: "text-amber-300",
  advanced: "text-red-300",
};

function faDateTime(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

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

function PreviewCard({ challenge }: { challenge: Challenge }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 opacity-85">
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
              <Clock className="h-3 w-3" /> {challenge.estimatedMinutes} دقیقه
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-200">{challenge.title}</h2>
        </div>
        <Lock className="h-5 w-5 shrink-0 text-slate-600" />
      </div>
      <p className="mt-3 text-sm font-bold leading-7 text-slate-400">{challenge.objective}</p>
      <div className="mt-4 rounded-xl border border-slate-500/15 bg-slate-500/5 p-3">
        <p className="text-xs font-black text-slate-400">پیش‌نمایش غیررسمی</p>
        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
          Completion، امتیاز، XP، Badge و Reward این تمرین تا اتصال معیار آن به Evidence معتبر سرور غیرفعال است.
        </p>
      </div>
    </article>
  );
}

function ProgressMetric({
  label,
  value,
  target,
}: {
  label: string;
  value: string;
  target: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <p className="text-[10px] font-black text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-slate-600">هدف: {target}</p>
    </div>
  );
}

function OfficialChallengeCard({
  state,
  command,
  onCommand,
}: {
  state: OfficialJournalChallengeStateClient;
  command: "join" | "evaluate" | null;
  onCommand: (action: "join" | "evaluate") => void;
}) {
  const percentage = Math.round(state.progress.coverageRate * 100);
  const statusLabel = state.status === "completed"
    ? "تکمیل رسمی"
    : state.status === "active"
      ? "در حال اجرا"
      : "عضو نشده";
  const statusClass = state.status === "completed"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : state.status === "active"
      ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-200"
      : "border-slate-500/20 bg-slate-500/10 text-slate-400";

  return (
    <article className="space-y-5 rounded-[28px] border border-violet-400/25 bg-violet-400/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-black text-violet-200">
              Challenge رسمی پایلوت
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-black text-white">{OFFICIAL_PILOT_CHALLENGE.title}</h2>
          <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-slate-300">
            {OFFICIAL_PILOT_CHALLENGE.objective}
          </p>
        </div>
        <ShieldCheck className="h-7 w-7 shrink-0 text-emerald-300" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ProgressMetric
          label="معاملات بسته‌شده واجد شرایط"
          value={String(state.progress.eligibleClosedTrades)}
          target={String(state.progress.minimumTrades)}
        />
        <ProgressMetric
          label="Reflection معتبر"
          value={String(state.progress.validReflections)}
          target="متصل به همان معامله"
        />
        <ProgressMetric
          label="پوشش Reflection"
          value={`${percentage}٪`}
          target={`${Math.round(state.progress.requiredRate * 100)}٪`}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[10px] font-black text-slate-500">
          <span>پیشرفت پوشش</span>
          <span>{percentage}٪</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-cyan-400 transition-[width]"
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
        <p className="text-xs font-black text-slate-400">چرخه معتبر سرور: {state.cycle.key}</p>
        <p className="mt-2 text-xs font-bold leading-6 text-slate-500">
          شروع هفته: {faDateTime(state.cycle.startsAt)} · پایان: {faDateTime(state.cycle.endsAt)}
        </p>
        {state.startedAt && (
          <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
            شروع عضویت شما: {faDateTime(state.startedAt)} — فعالیت قبل از این زمان محاسبه نمی‌شود.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black text-slate-500">قواعد رسمی:</p>
        {OFFICIAL_PILOT_CHALLENGE.rules.map((rule, index) => (
          <div key={rule} className="flex items-start gap-2 text-xs font-bold leading-6 text-slate-300">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-400/20 text-[9px] font-black text-violet-300">
              {index + 1}
            </span>
            {rule}
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold leading-6 text-emerald-200">
          {OFFICIAL_PILOT_CHALLENGE.responsibleTradingNote} سود، زیان و PnL در نتیجه این Challenge نقشی ندارند.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-xs font-black text-amber-200">Rewardها هنوز غیرفعال‌اند</p>
        <p className="mt-1 text-xs font-bold leading-6 text-amber-100/70">
          این Slice فقط Completion رسمی را فعال می‌کند. XP = ۰، Badge = ندارد و پاداش مالی = ندارد تا Authority جداگانه Reward تکمیل شود.
        </p>
      </div>

      {state.status === "not_joined" && (
        <button
          type="button"
          disabled={!state.consentEnabled || command !== null}
          onClick={() => onCommand("join")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {command === "join" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
          عضویت رسمی از همین لحظه
        </button>
      )}

      {state.status === "active" && (
        <button
          type="button"
          disabled={!state.consentEnabled || command !== null}
          onClick={() => onCommand("evaluate")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {command === "evaluate" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
          ارزیابی Evidence و ثبت نتیجه
        </button>
      )}

      {state.status === "completed" && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-sm font-black text-emerald-100">Completion رسمی و غیرقابل‌برگشت ثبت شد</p>
            <p className="mt-1 text-xs font-bold leading-6 text-emerald-100/70">
              زمان ثبت: {state.completedAt ? faDateTime(state.completedAt) : "—"}. این نتیجه از Evidence سرور ساخته شده و با داده مرورگر تغییر نمی‌کند.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="text-[10px] font-bold text-slate-600">
          آخرین ارزیابی: {state.evaluatedAt ? faDateTime(state.evaluatedAt) : "هنوز انجام نشده"}
        </span>
        <Link
          href="/academy/trading-arena/journal"
          className="text-xs font-black text-cyan-300 transition hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          مشاهده و تکمیل Reflectionها
        </Link>
      </div>
    </article>
  );
}

export function ChallengeCenter() {
  const [profile, setProfile] = useState<CommunityChallengeOwnedProfile | null>(null);
  const [challenge, setChallenge] = useState<OfficialJournalChallengeStateClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConsent, setSavingConsent] = useState(false);
  const [command, setCommand] = useState<"join" | "evaluate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    let loadedProfile: CommunityChallengeOwnedProfile | null = null;
    try {
      const [profileResponse, challengeResponse] = await Promise.all([
        fetch("/api/community/profile", { credentials: "include", cache: "no-store" }),
        fetch("/api/community/profile?view=journal-reflection-challenge", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const [profilePayload, challengePayload] = await Promise.all([
        json(profileResponse),
        json(challengeResponse),
      ]);
      if (!profileResponse.ok) throw new Error(errorCode(profilePayload));
      loadedProfile = parseCommunityChallengeProfilePayload(profilePayload);
      if (!loadedProfile) throw new Error("invalid_response");
      setProfile(loadedProfile);

      if (!challengeResponse.ok) throw new Error(errorCode(challengePayload));
      const loadedChallenge = parseOfficialJournalChallengePayload(challengePayload);
      if (!loadedChallenge) throw new Error("invalid_response");
      setChallenge(loadedChallenge);
    } catch (caught) {
      if (!loadedProfile) setProfile(null);
      setChallenge(null);
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleConsent = useCallback(async () => {
    if (!profile || savingConsent) return;
    setSavingConsent(true);
    setError(null);
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
          ...profile.consent,
          challengeParticipation: !profile.consent.challengeParticipation,
        }),
      });
      const payload = await json(response);
      if (!response.ok) {
        const code = errorCode(payload);
        if (code === "community_profile_revision_conflict") await loadAll();
        throw new Error(code);
      }
      const updated = parseCommunityChallengeConsentMutationPayload(payload);
      if (!updated) throw new Error("invalid_response");
      setProfile(updated);
      await loadAll();
    } catch (caught) {
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setSavingConsent(false);
    }
  }, [loadAll, profile, savingConsent]);

  const runCommand = useCallback(async (action: "join" | "evaluate") => {
    if (!challenge || command) return;
    setCommand(action);
    setError(null);
    try {
      const response = await fetch(
        "/api/community/profile?view=journal-reflection-challenge",
        {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createCommunityChallengeIdempotencyKey(),
          },
          body: JSON.stringify({ action, cycleKey: challenge.cycle.key }),
        },
      );
      const payload = await json(response);
      if (!response.ok) {
        const code = errorCode(payload);
        if (code === "challenge_cycle_conflict") await loadAll();
        throw new Error(code);
      }
      const updated = parseOfficialJournalChallengePayload(payload);
      if (!updated) throw new Error("invalid_response");
      setChallenge(updated);
    } catch (caught) {
      setError(communityChallengeUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setCommand(null);
    }
  }, [challenge, command, loadAll]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-slate-400">
        <LoaderCircle className="h-5 w-5 animate-spin" /> دریافت Challenge رسمی از سرور
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">چالش‌های آموزشی</h1>
          <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-slate-400">
            فقط Challenge بازتاب ژورنال در این مرحله Authority رسمی دارد؛ سایر تمرین‌ها تا تکمیل Evidence سرور، پیش‌نمایش باقی می‌مانند.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10">
          <Flame className="h-6 w-6 text-orange-300" />
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold leading-6 text-emerald-100/80">
          زمان چرخه، عضویت، معاملات واجد شرایط، Reflectionها و Completion همگی از PostgreSQL و ساعت سرور می‌آیند. زمان، Score یا LocalStorage مرورگر هیچ نقشی ندارند.
        </p>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <p className="font-black text-amber-100">پروفایل حساب‌محور در دسترس نیست</p>
          <p className="mt-2 text-sm font-bold leading-7 text-amber-100/70">
            بدون Identity و Consent معتبر، عضویت یا ارزیابی رسمی انجام نمی‌شود.
          </p>
        </div>
      ) : (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-black text-white">رضایت شرکت در Challengeهای رسمی</p>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
                این تنظیم در حساب شما ذخیره می‌شود و بین دستگاه‌ها یکسان است. خاموش‌کردن آن ثبت‌نام یا ارزیابی جدید را متوقف می‌کند؛ Completion قبلی را بازنویسی نمی‌کند.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleConsent()}
              disabled={savingConsent || command !== null}
              className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={profile.consent.challengeParticipation
                ? "غیرفعال کردن رضایت شرکت در چالش"
                : "فعال کردن رضایت شرکت در چالش"}
              aria-checked={profile.consent.challengeParticipation}
              aria-busy={savingConsent}
              role="switch"
            >
              {savingConsent ? (
                <LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" />
              ) : profile.consent.challengeParticipation ? (
                <ToggleRight className="h-9 w-9 text-cyan-400" />
              ) : (
                <ToggleLeft className="h-9 w-9 text-slate-600" />
              )}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 p-4" role="alert">
          <div className="flex items-start gap-2 text-xs font-bold leading-6 text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1 rounded-xl border border-red-300/25 px-3 py-2 text-xs font-black text-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تلاش دوباره
          </button>
        </div>
      )}

      {challenge ? (
        <OfficialChallengeCard
          state={challenge}
          command={command}
          onCommand={(action) => void runCommand(action)}
        />
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/10 p-8 text-center">
          <Award className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="font-black text-slate-300">Authority رسمی Challenge در دسترس نیست</p>
          <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-7 text-slate-500">
            هیچ Completion یا امتیاز محلی نمایش داده نمی‌شود. پس از بازگشت PostgreSQL، وضعیت دقیق دوباره دریافت خواهد شد.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-white">تمرین‌های بعدی</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            این موارد کاتالوگ آموزشی‌اند و هنوز Completion رسمی ندارند.
          </p>
        </div>
        {PREVIEW_ONLY_CHALLENGES.map((challengeEntry) => (
          <PreviewCard key={challengeEntry.id} challenge={challengeEntry} />
        ))}
      </section>
    </div>
  );
}
