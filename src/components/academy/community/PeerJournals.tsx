"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  communityJournalUiError,
  createCommunityJournalIdempotencyKey,
  parseCommunityConsentMutationPayload,
  parseCommunityJournalFeedPayload,
  parseCommunityOwnedProfilePayload,
  type CommunityJournalEntryClient,
  type CommunityJournalMistakeTag,
  type CommunityOwnedProfileClient,
} from "@/lib/community-journal-client";

const TAG_LABEL: Record<CommunityJournalMistakeTag, string> = {
  "late-entry": "ورود دیرهنگام",
  "early-exit": "خروج زودهنگام",
  "oversized-position": "حجم بیش از حد",
  "missing-stop-loss": "نبود حد ضرر",
  "moved-stop-loss": "جابه‌جایی حد ضرر",
  "fomo-entry": "ورود FOMO",
  "revenge-trade": "معامله انتقامی",
  "ignored-plan": "نادیده‌گرفتن برنامه",
  "poor-risk-reward": "نسبت ریسک‌به‌بازده ضعیف",
  overtrading: "بیش‌معامله‌گری",
  none: "بدون خطای ثبت‌شده",
};

function faDateTime(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
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

function mergeEntries(
  current: CommunityJournalEntryClient[],
  incoming: CommunityJournalEntryClient[],
): CommunityJournalEntryClient[] {
  const entries = new Map(current.map((entry) => [entry.entryId, entry]));
  for (const entry of incoming) entries.set(entry.entryId, entry);
  return [...entries.values()];
}

function SharedEntryCard({ entry }: { entry: CommunityJournalEntryClient }) {
  return (
    <article className={`space-y-4 rounded-[24px] border p-5 ${entry.isMine
      ? "border-cyan-300/25 bg-cyan-400/5"
      : "border-white/10 bg-slate-900/60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/50 text-xs font-black text-slate-300">
            {entry.asset}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-100">{entry.authorAlias}</p>
              {entry.isMine && (
                <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black text-cyan-200">
                  بازتاب من
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-500">
              بسته‌شدن معامله: {faDateTime(entry.closedAt)}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-200">
          <ShieldCheck className="h-3.5 w-3.5" /> بازتاب معتبر آرنا
        </span>
      </div>

      <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4">
        <p className="text-xs font-black text-violet-300">درس کلیدی</p>
        <p className="mt-2 text-sm font-bold leading-7 text-violet-100">{entry.learnedLesson}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {entry.mistakeTags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${tag === "none"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/25 bg-amber-400/10 text-amber-200"}`}
          >
            {TAG_LABEL[tag]}
          </span>
        ))}
      </div>

      {entry.nextActionCommitment && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs font-black text-slate-500">تعهد برای معامله بعدی</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-300">
            {entry.nextActionCommitment}
          </p>
        </div>
      )}

      <p className="text-[10px] font-bold text-slate-600">
        آخرین نسخه اشتراک‌گذاری‌شده: {faDateTime(entry.sharedAt)}
      </p>
    </article>
  );
}

export function PeerJournals() {
  const [profile, setProfile] = useState<CommunityOwnedProfileClient | null>(null);
  const [entries, setEntries] = useState<CommunityJournalEntryClient[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResponse, feedResponse] = await Promise.all([
        fetch("/api/community/profile", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/community/journals?limit=20", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const [profilePayload, feedPayload] = await Promise.all([
        json(profileResponse),
        json(feedResponse),
      ]);
      if (!profileResponse.ok) throw new Error(errorCode(profilePayload));
      if (!feedResponse.ok) throw new Error(errorCode(feedPayload));
      const parsedProfile = parseCommunityOwnedProfilePayload(profilePayload);
      const parsedFeed = parseCommunityJournalFeedPayload(feedPayload);
      if (!parsedProfile || !parsedFeed) throw new Error("invalid_response");
      setProfile(parsedProfile);
      setEntries(parsedFeed.entries);
      setNextCursor(parsedFeed.nextCursor);
    } catch (caught) {
      setProfile(null);
      setEntries([]);
      setNextCursor(null);
      setError(communityJournalUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/community/journals?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = await json(response);
      if (!response.ok) throw new Error(errorCode(payload));
      const parsed = parseCommunityJournalFeedPayload(payload);
      if (!parsed) throw new Error("invalid_response");
      setEntries((current) => mergeEntries(current, parsed.entries));
      setNextCursor(parsed.nextCursor);
    } catch (caught) {
      setError(communityJournalUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  const toggleSharing = useCallback(async () => {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    const consent = {
      ...profile.consent,
      journalSharingEnabled: !profile.consent.journalSharingEnabled,
    };
    try {
      const response = await fetch("/api/community/profile", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createCommunityJournalIdempotencyKey(),
        },
        body: JSON.stringify({
          expectedRevision: profile.revision,
          ...consent,
        }),
      });
      const payload = await json(response);
      if (!response.ok) {
        const code = errorCode(payload);
        if (code === "community_profile_revision_conflict") {
          await loadInitial();
        }
        throw new Error(code);
      }
      const updated = parseCommunityConsentMutationPayload(payload);
      if (!updated) throw new Error("invalid_response");
      setProfile(updated);

      const feedResponse = await fetch("/api/community/journals?limit=20", {
        credentials: "include",
        cache: "no-store",
      });
      const feedPayload = await json(feedResponse);
      if (!feedResponse.ok) throw new Error(errorCode(feedPayload));
      const feed = parseCommunityJournalFeedPayload(feedPayload);
      if (!feed) throw new Error("invalid_response");
      setEntries(feed.entries);
      setNextCursor(feed.nextCursor);
    } catch (caught) {
      setError(communityJournalUiError(caught instanceof Error ? caught.message : caught));
    } finally {
      setSaving(false);
    }
  }, [loadInitial, profile, saving]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-slate-400">
        <LoaderCircle className="h-5 w-5 animate-spin" /> دریافت ژورنال‌های معتبر از سرور
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">ژورنال‌های مشترک</h1>
          <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-slate-400">
            درس‌های اختیاری و حریم‌خصوصی‌محور از Reflectionهای واقعی Trading Arena؛ بدون اطلاعات هویتی، موجودی یا PnL دقیق.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10">
          <BookOpen className="h-6 w-6 text-cyan-300" />
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <div>
          <p className="text-xs font-black text-emerald-200">مرجع یگانه: سرور تک‌پی</p>
          <p className="mt-1 text-xs font-bold leading-6 text-emerald-100/80">
            این صفحه فقط Reflectionهای ذخیره‌شده در PostgreSQL و متصل به معامله بسته‌شده معتبر را نمایش می‌دهد. داده مرورگر و نمونه نمایشی وارد Feed نمی‌شود.
          </p>
        </div>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <p className="font-black text-amber-100">پروفایل معتبر جامعه در دسترس نیست</p>
          <p className="mt-2 text-sm font-bold leading-7 text-amber-100/70">
            بدون پروفایل حساب‌محور، مشاهده یا تغییر اشتراک‌گذاری انجام نمی‌شود.
          </p>
        </div>
      ) : (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-black text-white">اشتراک‌گذاری بازتاب‌های معتبر من</p>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
                با فعال‌سازی، فقط درس کلیدی، برچسب خطا، اقدام بعدی، دارایی و زمان معتبر Reflectionهای تکمیل‌شده در Feed همین مستاجر نمایش داده می‌شود. خاموش‌کردن، بازتاب‌های شما را فوراً از Feed حذف می‌کند.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleSharing()}
              disabled={saving}
              className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={profile.consent.journalSharingEnabled
                ? "غیرفعال کردن اشتراک‌گذاری ژورنال"
                : "فعال کردن اشتراک‌گذاری ژورنال"}
              aria-checked={profile.consent.journalSharingEnabled}
              aria-busy={saving}
              role="switch"
            >
              {saving ? (
                <LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" />
              ) : profile.consent.journalSharingEnabled ? (
                <ToggleRight className="h-9 w-9 text-cyan-400" />
              ) : (
                <ToggleLeft className="h-9 w-9 text-slate-600" />
              )}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${profile.consent.journalSharingEnabled
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-slate-500/20 bg-slate-500/10 text-slate-400"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {profile.consent.journalSharingEnabled ? "رضایت فعال" : "رضایت غیرفعال"}
            </span>
            <Link
              href="/academy/trading-arena/journal"
              className="text-xs font-black text-cyan-300 transition hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              ثبت و مدیریت Reflectionهای من
            </Link>
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
            onClick={() => void loadInitial()}
            className="inline-flex items-center gap-1 rounded-xl border border-red-300/25 px-3 py-2 text-xs font-black text-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تلاش دوباره
          </button>
        </div>
      )}

      <section className="space-y-4" aria-label="بازتاب‌های مشترک معتبر">
        {entries.length > 0 ? (
          entries.map((entry) => <SharedEntryCard key={entry.entryId} entry={entry} />)
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 p-8 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <p className="font-black text-slate-300">هنوز بازتاب مشترک معتبری وجود ندارد</p>
            <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-7 text-slate-500">
              Feed فقط زمانی پر می‌شود که یک یادگیرنده Reflection معتبر Arena داشته باشد و رضایت اشتراک‌گذاری حساب‌محور او فعال باشد.
            </p>
          </div>
        )}
      </section>

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mx-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          نمایش بازتاب‌های بیشتر
        </button>
      )}
    </div>
  );
}
