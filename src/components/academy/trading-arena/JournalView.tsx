"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileClock,
  LoaderCircle,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arenaUiError,
  parseArenaExecutionSnapshot,
  shouldApplyArenaSnapshot,
  type ArenaExecutionSnapshot,
} from "@/lib/trading-arena-client";
import {
  ARENA_REFLECTION_TAG_OPTIONS,
  arenaReflectionUiError,
  parseArenaReflectionList,
  parseArenaReflectionMutation,
  reflectionDraftFromAuthoritative,
  resolveArenaReflectionIdentity,
  shouldApplyArenaReflectionMutation,
  type ArenaPendingReflectionIdentity,
  type ArenaReflectionDraft,
  type ArenaReflectionTag,
  type ArenaReflectionView,
} from "@/lib/trading-arena-reflection-client";
import type {
  ArenaClosedTradeV2,
  ArenaExecutionMentorFlag,
  ArenaOpenPositionV2,
  ArenaPendingOrderV2,
} from "@/lib/trading-arena-execution-v2";

const EXECUTION_ENDPOINT = "/api/trading-arena/execution";
const REFLECTION_ENDPOINT = "/api/trading-arena/reflections";
type JournalLocale = "fa" | "en";

const FLAG_LABEL: Record<JournalLocale, Record<ArenaExecutionMentorFlag, string>> = {
  fa: {
    "no-stop-loss": "بدون حد ضرر",
    "over-risk": "ریسک بالا",
    "impulse-entry": "ورود شتاب‌زده",
    "revenge-trade": "معامله انتقامی",
    "fomo-entry": "ورود FOMO",
    "good-discipline": "انضباط مناسب",
    "proper-sizing": "حجم مناسب",
    "target-hit": "هدف محقق شد",
  },
  en: {
    "no-stop-loss": "No stop-loss",
    "over-risk": "High allocation",
    "impulse-entry": "Impulse entry",
    "revenge-trade": "Revenge trade",
    "fomo-entry": "FOMO entry",
    "good-discipline": "Good discipline",
    "proper-sizing": "Proper sizing",
    "target-hit": "Target reached",
  },
};

const TAG_LABEL: Record<JournalLocale, Record<ArenaReflectionTag, string>> = {
  fa: {
    "late-entry": "ورود دیرهنگام",
    "early-exit": "خروج زودهنگام",
    "oversized-position": "حجم بیش از حد",
    "missing-stop-loss": "نبود حد ضرر",
    "moved-stop-loss": "جابه‌جایی حد ضرر",
    "fomo-entry": "ورود از ترس جا ماندن",
    "revenge-trade": "معامله انتقامی",
    "ignored-plan": "نادیده‌گرفتن برنامه",
    "poor-risk-reward": "نسبت ریسک‌به‌بازده ضعیف",
    overtrading: "بیش‌معامله‌گری",
    none: "هیچ‌کدام",
  },
  en: {
    "late-entry": "Late entry",
    "early-exit": "Early exit",
    "oversized-position": "Oversized position",
    "missing-stop-loss": "Missing stop-loss",
    "moved-stop-loss": "Moved stop-loss",
    "fomo-entry": "FOMO entry",
    "revenge-trade": "Revenge trade",
    "ignored-plan": "Ignored plan",
    "poor-risk-reward": "Poor risk-to-reward",
    overtrading: "Overtrading",
    none: "None",
  },
};

function number(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usd(value: string | number): string {
  return `$${number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value: string | number, locale: JournalLocale): string {
  const parsed = number(value) * 100;
  const formatted = parsed.toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 2 });
  return locale === "fa" ? `${parsed >= 0 ? "+" : ""}${formatted}٪` : `${parsed >= 0 ? "+" : ""}${formatted}%`;
}

function dateTime(value: string, locale: JournalLocale): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Flag({ flag, locale }: { flag: ArenaExecutionMentorFlag; locale: JournalLocale }) {
  const positive = flag === "good-discipline" || flag === "proper-sizing" || flag === "target-hit";
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${positive
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>
      {FLAG_LABEL[locale][flag]}
    </span>
  );
}

function OpenEvidence({ position, locale }: { position: ArenaOpenPositionV2; locale: JournalLocale }) {
  const isFa = locale === "fa";
  return (
    <article className="rounded-[24px] border border-cyan-300/15 bg-cyan-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black">{position.asset} · {isFa ? "موقعیت باز" : "Open position"}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {dateTime(position.openedAt, locale)} · {isFa ? "ورود" : "Entry"} {usd(position.entryPrice)}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/20 px-2.5 py-1 text-xs font-black text-cyan-300">
          {usd(position.quoteCommitted)} {isFa ? "تعهد" : "committed"}
        </span>
      </div>
      {position.preTradePlan ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs font-black text-slate-500">{isFa ? "برنامه پیش از معامله" : "Pre-trade plan"}</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{position.preTradePlan}</p>
        </div>
      ) : (
        <p className="mt-4 text-xs font-bold text-slate-500">{isFa ? "برای این موقعیت برنامه متنی ثبت نشده است." : "No written plan was recorded for this position."}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black text-slate-400">
          {isFa ? "حالت" : "State"}: {position.emotionalState || (isFa ? "ثبت نشده" : "Not recorded")}
        </span>
        {position.mentorFlags.map((flag) => <Flag key={flag} flag={flag} locale={locale} />)}
      </div>
    </article>
  );
}

function PendingEvidence({ order, locale }: { order: ArenaPendingOrderV2; locale: JournalLocale }) {
  const isFa = locale === "fa";
  return (
    <article className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black">{order.asset} · {isFa ? "سفارش محدود در انتظار" : "Pending limit order"}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {dateTime(order.createdAt, locale)} · {isFa ? "هدف ورود" : "Entry target"} {usd(order.limitPrice)}
          </p>
        </div>
        <Clock3 className="h-5 w-5 text-amber-300" />
      </div>
      <p className="mt-4 text-sm font-bold text-slate-300">{isFa ? "وجه رزروشده" : "Reserved cash"}: {usd(order.quoteReserved)}</p>
      {order.preTradePlan && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm font-bold leading-7 text-slate-300">
          {isFa ? "برنامه" : "Plan"}: {order.preTradePlan}
        </p>
      )}
    </article>
  );
}

type ReflectionEditorProps = {
  trade: ArenaClosedTradeV2;
  locale: JournalLocale;
  reflection: ArenaReflectionView | null;
  draft: ArenaReflectionDraft;
  pending: ArenaPendingReflectionIdentity | null;
  saving: boolean;
  error: string | null;
  onChange: (draft: ArenaReflectionDraft) => void;
  onSave: () => void;
  onRefresh: () => void;
};

function ReflectionEditor({
  trade,
  locale,
  reflection,
  draft,
  pending,
  saving,
  error,
  onChange,
  onSave,
  onRefresh,
}: ReflectionEditorProps) {
  const isFa = locale === "fa";
  const toggleTag = (tag: ArenaReflectionTag) => {
    if (tag === "none") {
      onChange({ ...draft, mistakeTags: ["none"] });
      return;
    }
    const withoutNone = draft.mistakeTags.filter((item) => item !== "none");
    const selected = withoutNone.includes(tag)
      ? withoutNone.filter((item) => item !== tag)
      : [...withoutNone, tag];
    onChange({ ...draft, mistakeTags: selected.length > 0 ? selected : ["none"] });
  };

  return (
    <section className="mt-5 border-t border-white/10 pt-5" aria-labelledby={`reflection-${trade.id}`} aria-busy={saving}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={`reflection-${trade.id}`} className="font-black text-violet-100">
            {isFa ? "بازتاب پس از معامله" : "Post-trade reflection"}
          </h3>
          <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
            {isFa ? "تحلیل تو به شواهد قطعی این معامله متصل و در حساب تک‌پی ذخیره می‌شود." : "Your analysis is bound to this trade's authoritative evidence and saved to your TecPey account."}
          </p>
        </div>
        {reflection ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> {isFa ? "نسخه" : "Revision"} {reflection.revision}
          </span>
        ) : (
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black text-slate-500">
            {isFa ? "هنوز ذخیره نشده" : "Not saved yet"}
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-xs font-bold leading-6 text-amber-100">
          <p className="max-w-2xl">
            {isFa ? "نتیجه آخرین ذخیره‌سازی هنوز قطعی نیست. فقط همان متن قبلی را می‌توان با همان شناسه دوباره ارسال کرد؛ برای بررسی نتیجه سرور، ژورنال را تازه‌سازی کن." : "The latest save is not final yet. Only the same content may be retried with its original identity; refresh the journal to check the server result."}
          </p>
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 rounded-xl border border-amber-300/25 px-3 py-2 font-black">
            <RefreshCw className="h-3.5 w-3.5" /> {isFa ? "بررسی سرور" : "Check server"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-xs font-bold leading-6 text-red-100" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block text-xs font-black text-slate-400">
          {isFa ? "مرور تصمیم و اجرای معامله" : "Decision and execution review"}
          <textarea
            value={draft.decisionReview}
            onChange={(event) => onChange({ ...draft, decisionReview: event.target.value })}
            disabled={saving}
            maxLength={4_000}
            rows={4}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm font-bold leading-7 text-white outline-none transition focus:border-violet-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={isFa ? "چه تصمیمی گرفتم و اجرای من نسبت به برنامه چگونه بود؟" : "What decision did I make, and how did execution compare with my plan?"}
          />
        </label>
        <label className="block text-xs font-black text-slate-400">
          {isFa ? "مهم‌ترین درس" : "Most important lesson"}
          <textarea
            value={draft.learnedLesson}
            onChange={(event) => onChange({ ...draft, learnedLesson: event.target.value })}
            disabled={saving}
            maxLength={4_000}
            rows={4}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm font-bold leading-7 text-white outline-none transition focus:border-violet-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={isFa ? "از این معامله چه چیزی یاد گرفتم؟" : "What did I learn from this trade?"}
          />
        </label>
        <label className="block text-xs font-black text-slate-400">
          {isFa ? "مرور احساسات" : "Emotional review"}
          <textarea
            value={draft.emotionalReview}
            onChange={(event) => onChange({ ...draft, emotionalReview: event.target.value })}
            disabled={saving}
            maxLength={2_000}
            rows={3}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm font-bold leading-7 text-white outline-none transition focus:border-violet-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={isFa ? "پیش و هنگام خروج چه احساسی داشتم و چه اثری روی تصمیمم گذاشت؟" : "How did I feel before and during the exit, and how did it affect my decision?"}
          />
        </label>
        <label className="block text-xs font-black text-slate-400">
          {isFa ? "تعهد برای معامله بعدی" : "Commitment for the next trade"} <span className="text-slate-600">{isFa ? "(اختیاری)" : "(optional)"}</span>
          <textarea
            value={draft.nextActionCommitment}
            onChange={(event) => onChange({ ...draft, nextActionCommitment: event.target.value })}
            disabled={saving}
            maxLength={2_000}
            rows={3}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm font-bold leading-7 text-white outline-none transition focus:border-violet-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={isFa ? "در معامله بعدی دقیقاً چه رفتاری را تغییر می‌دهم؟" : "What behaviour will I change in the next trade?"}
          />
        </label>
      </div>

      <fieldset className="mt-4" disabled={saving}>
        <legend className="text-xs font-black text-slate-400">{isFa ? "خطاها یا الگوهای قابل اصلاح" : "Mistakes or patterns to improve"}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ARENA_REFLECTION_TAG_OPTIONS.map((tag) => {
            const checked = draft.mistakeTags.includes(tag);
            return (
              <label key={tag} className={`cursor-pointer rounded-full border px-3 py-2 text-[11px] font-black transition ${checked
                ? "border-violet-300/35 bg-violet-400/15 text-violet-100"
                : "border-white/10 bg-slate-950/30 text-slate-500 hover:text-slate-300"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTag(tag)}
                  className="sr-only"
                />
                {TAG_LABEL[locale][tag]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-slate-600">
          {isFa ? "شواهد مالی این فرم قابل ویرایش نیست و از معامله معتبر سرور خوانده می‌شود." : "Financial evidence in this form is immutable and comes from the server-authoritative trade."}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {reflection ? (isFa ? "ذخیره نسخه جدید" : "Save new revision") : (isFa ? "ثبت بازتاب" : "Save reflection")}
        </button>
      </div>
    </section>
  );
}

function ClosedEvidence({
  trade,
  locale,
  reflection,
  draft,
  pending,
  saving,
  error,
  onDraftChange,
  onSave,
  onRefresh,
}: {
  trade: ArenaClosedTradeV2;
  locale: JournalLocale;
  reflection: ArenaReflectionView | null;
  draft: ArenaReflectionDraft;
  pending: ArenaPendingReflectionIdentity | null;
  saving: boolean;
  error: string | null;
  onDraftChange: (draft: ArenaReflectionDraft) => void;
  onSave: () => void;
  onRefresh: () => void;
}) {
  const isFa = locale === "fa";
  const pnl = number(trade.realizedPnl);
  const reason = trade.closureReason === "manual"
    ? (isFa ? "بستن دستی" : "Manual close")
    : trade.closureReason === "stop-loss"
      ? (isFa ? "فعال‌شدن حد ضرر" : "Stop-loss triggered")
      : (isFa ? "فعال‌شدن حد سود" : "Take-profit triggered");

  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {pnl >= 0
            ? <ArrowUpRight className="mt-0.5 h-5 w-5 text-emerald-300" />
            : <ArrowDownRight className="mt-0.5 h-5 w-5 text-red-300" />}
          <div>
            <p className="font-black">{trade.asset} · {reason}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {dateTime(trade.openedAt, locale)} {isFa ? "تا" : "to"} {dateTime(trade.closedAt, locale)}
            </p>
          </div>
        </div>
        <div className="text-left">
          <p className={`font-black ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {pnl >= 0 ? "+" : "-"}{usd(Math.abs(pnl))}
          </p>
          <p className="text-xs font-bold text-slate-500">{percent(trade.realizedPnlRate, locale)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-400 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">{isFa ? "ورود" : "Entry"}</span>{usd(trade.entryPrice)}</div>
        <div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">{isFa ? "خروج" : "Exit"}</span>{usd(trade.exitPrice)}</div>
        <div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">{isFa ? "تعهد" : "Committed"}</span>{usd(trade.quoteCommitted)}</div>
        <div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">{isFa ? "کارمزد" : "Fees"}</span>{usd(trade.totalFee)}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {trade.mentorFlags.length > 0
          ? trade.mentorFlags.map((flag) => <Flag key={flag} flag={flag} locale={locale} />)
          : <span className="text-xs font-bold text-slate-600">{isFa ? "برچسب رفتاری ثبت نشده است." : "No behavioural tag was recorded."}</span>}
      </div>
      <ReflectionEditor
        trade={trade}
        locale={locale}
        reflection={reflection}
        draft={draft}
        pending={pending}
        saving={saving}
        error={error}
        onChange={onDraftChange}
        onSave={onSave}
        onRefresh={onRefresh}
      />
    </article>
  );
}

export function JournalView({ locale = "fa" }: { locale?: JournalLocale }) {
  const isFa = locale === "fa";
  const [snapshot, setSnapshot] = useState<ArenaExecutionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, ArenaReflectionView>>({});
  const [drafts, setDrafts] = useState<Record<string, ArenaReflectionDraft>>({});
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionErrors, setReflectionErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [pendingIdentities, setPendingIdentities] = useState<
    Record<string, ArenaPendingReflectionIdentity | undefined>
  >({});
  const mountedRef = useRef(true);
  const snapshotRef = useRef<ArenaExecutionSnapshot | null>(null);
  const reflectionsRef = useRef<Record<string, ArenaReflectionView>>({});
  const pendingRef = useRef<Record<string, ArenaPendingReflectionIdentity | undefined>>({});
  const sequenceRef = useRef(0);
  const lastAppliedSequenceRef = useRef(0);
  const reflectionSequenceRef = useRef(0);
  const reflectionMutationSequenceRef = useRef<Record<string, number>>({});

  const updatePendingIdentity = useCallback((
    tradeId: string,
    identity: ArenaPendingReflectionIdentity | null,
  ) => {
    if (identity) {
      pendingRef.current[tradeId] = identity;
    } else {
      delete pendingRef.current[tradeId];
    }
    setPendingIdentities((current) => {
      const next = { ...current };
      if (identity) next[tradeId] = identity;
      else delete next[tradeId];
      return next;
    });
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const responseSequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(EXECUTION_ENDPOINT, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        if (mountedRef.current) setError(arenaUiError(body.error, response.status, locale));
        return;
      }
      const parsed = parseArenaExecutionSnapshot(body);
      if (!parsed) throw new Error("arena_snapshot_invalid");
      const decision = shouldApplyArenaSnapshot({
        current: snapshotRef.current,
        incoming: parsed,
        responseSequence,
        lastAppliedSequence: lastAppliedSequenceRef.current,
      });
      if (decision.apply && mountedRef.current) {
        lastAppliedSequenceRef.current = decision.nextSequence;
        snapshotRef.current = parsed;
        setSnapshot(parsed);
        setError(null);
      }
    } catch {
      if (mountedRef.current) setError(arenaUiError("arena_execution_unavailable", undefined, locale));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [locale]);

  const loadReflections = useCallback(async (activeAttemptId: string) => {
    const responseSequence = ++reflectionSequenceRef.current;
    setReflectionLoading(true);
    try {
      const response = await fetch(`${REFLECTION_ENDPOINT}?attemptId=${encodeURIComponent(activeAttemptId)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        if (mountedRef.current && responseSequence === reflectionSequenceRef.current) {
          setError(arenaReflectionUiError(body.error, response.status, locale));
        }
        return;
      }
      const parsed = parseArenaReflectionList(body);
      if (!parsed || parsed.attemptId !== activeAttemptId) throw new Error("arena_reflection_list_invalid");
      if (!mountedRef.current || responseSequence !== reflectionSequenceRef.current) return;

      const next = { ...reflectionsRef.current };
      for (const incoming of parsed.reflections) {
        const current = next[incoming.closedTradeId];
        if (!current || incoming.revision >= current.revision) {
          next[incoming.closedTradeId] = incoming;
        }
      }
      reflectionsRef.current = next;
      setReflections(next);
      setDrafts((current) => {
        const result = { ...current };
        for (const trade of snapshotRef.current?.state.closedTrades ?? []) {
          if (!result[trade.id]) result[trade.id] = reflectionDraftFromAuthoritative(next[trade.id] ?? null);
        }
        return result;
      });
      const pendingNext = { ...pendingRef.current };
      for (const [tradeId, identity] of Object.entries(pendingNext)) {
        const authoritative = next[tradeId];
        if (identity && authoritative && authoritative.revision > identity.expectedRevision) {
          delete pendingNext[tradeId];
        }
      }
      pendingRef.current = pendingNext;
      setPendingIdentities(pendingNext);
      setError(null);
    } catch {
      if (mountedRef.current && responseSequence === reflectionSequenceRef.current) {
        setError(arenaReflectionUiError("arena_reflections_unavailable", undefined, locale));
      }
    } finally {
      if (mountedRef.current && responseSequence === reflectionSequenceRef.current) {
        setReflectionLoading(false);
      }
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const activeAttemptId = snapshot?.activeAttempt.id;
    if (!activeAttemptId) return;
    reflectionsRef.current = {};
    reflectionMutationSequenceRef.current = {};
    pendingRef.current = {};
    setPendingIdentities({});
    setReflections({});
    setDrafts({});
    setReflectionErrors({});
    setSaving({});
    void loadReflections(activeAttemptId);
  }, [snapshot?.activeAttempt.id, loadReflections]);

  const saveReflection = useCallback(async (trade: ArenaClosedTradeV2) => {
    const active = snapshotRef.current?.activeAttempt;
    if (!active) return;
    const projected = reflectionsRef.current[trade.id] ?? null;
    const draft = drafts[trade.id] ?? reflectionDraftFromAuthoritative(projected);
    if (!draft.decisionReview.trim() || !draft.learnedLesson.trim() || !draft.emotionalReview.trim()) {
      setReflectionErrors((current) => ({
        ...current,
        [trade.id]: isFa ? "مرور تصمیم، درس و احساسات برای ثبت بازتاب ضروری است." : "Decision review, lesson and emotional review are required.",
      }));
      return;
    }

    const decision = resolveArenaReflectionIdentity({
      pending: pendingRef.current[trade.id] ?? null,
      attemptId: active.id,
      closedTradeId: trade.id,
      expectedRevision: projected?.revision ?? 0,
      draft,
    });
    if (decision.kind === "blocked") {
      setReflectionErrors((current) => ({
        ...current,
        [trade.id]: isFa ? "نتیجه درخواست قبلی نامشخص است. متن را به نسخه قبلی برگردان و دوباره ارسال کن، یا ابتدا وضعیت سرور را تازه‌سازی کن." : "The previous request result is unresolved. Restore the previous text and retry it, or refresh the server state first.",
      }));
      return;
    }

    const responseSequence = (reflectionMutationSequenceRef.current[trade.id] ?? 0) + 1;
    reflectionMutationSequenceRef.current[trade.id] = responseSequence;
    const isLatestResponse = () =>
      reflectionMutationSequenceRef.current[trade.id] === responseSequence;
    const applyIncoming = (incoming: ArenaReflectionView): boolean => {
      const current = reflectionsRef.current[trade.id] ?? null;
      if (!shouldApplyArenaReflectionMutation({
        current,
        incoming,
        responseSequence,
        latestResponseSequence: reflectionMutationSequenceRef.current[trade.id] ?? 0,
      })) {
        return false;
      }
      const next = { ...reflectionsRef.current, [trade.id]: incoming };
      reflectionsRef.current = next;
      setReflections(next);
      return true;
    };

    updatePendingIdentity(trade.id, decision.identity);
    setSaving((current) => ({ ...current, [trade.id]: true }));
    setReflectionErrors((current) => ({ ...current, [trade.id]: null }));

    try {
      const response = await fetch(REFLECTION_ENDPOINT, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": decision.identity.idempotencyKey,
        },
        body: JSON.stringify(decision.identity.request),
      });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        if (!isLatestResponse()) return;
        const conflict = response.status === 409 ? parseArenaReflectionMutation(body) : null;
        if (conflict?.reflection) applyIncoming(conflict.reflection);
        if (
          response.status < 500 &&
          pendingRef.current[trade.id]?.idempotencyKey === decision.identity.idempotencyKey
        ) {
          updatePendingIdentity(trade.id, null);
        }
        setReflectionErrors((current) => ({
          ...current,
          [trade.id]: arenaReflectionUiError(body.error, response.status, locale),
        }));
        return;
      }

      const parsed = parseArenaReflectionMutation(body);
      if (!parsed || parsed.attemptId !== active.id || parsed.reflection.closedTradeId !== trade.id) {
        throw new Error("arena_reflection_response_invalid");
      }
      if (!isLatestResponse()) return;
      const applied = applyIncoming(parsed.reflection);
      if (pendingRef.current[trade.id]?.idempotencyKey === decision.identity.idempotencyKey) {
        updatePendingIdentity(trade.id, null);
      }
      if (applied) {
        setDrafts((current) => ({
          ...current,
          [trade.id]: reflectionDraftFromAuthoritative(parsed.reflection),
        }));
      }
      setReflectionErrors((current) => ({ ...current, [trade.id]: null }));
    } catch {
      if (isLatestResponse()) {
        setReflectionErrors((current) => ({
          ...current,
          [trade.id]: arenaReflectionUiError("arena_reflections_unavailable", undefined, locale),
        }));
      }
    } finally {
      if (mountedRef.current && isLatestResponse()) {
        setSaving((current) => ({ ...current, [trade.id]: false }));
      }
    }
  }, [drafts, isFa, locale, updatePendingIdentity]);

  const stats = useMemo(() => {
    const closed = snapshot?.state.closedTrades ?? [];
    const wins = closed.filter((trade) => number(trade.realizedPnl) > 0).length;
    const riskFlags = closed.filter((trade) => trade.mentorFlags.some((flag) =>
      ["over-risk", "revenge-trade", "fomo-entry", "impulse-entry"].includes(flag))).length;
    return { closed: closed.length, wins, riskFlags };
  }, [snapshot]);

  return (
    <div className="space-y-6" dir={isFa ? "rtl" : "ltr"}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black sm:text-3xl">{isFa ? "ژورنال معاملاتی سروری" : "Server trading journal"}</h1>
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          </div>
          <p className="mt-1 text-sm font-bold text-slate-400">{isFa ? "شواهد اجرا و بازتاب‌های آموزشی از PostgreSQL معتبر" : "Execution evidence and learning reflections from authoritative PostgreSQL state"}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void load();
              if (snapshotRef.current?.activeAttempt.id) void loadReflections(snapshotRef.current.activeAttempt.id);
            }}
            disabled={loading || reflectionLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || reflectionLoading ? "animate-spin" : ""}`} /> {isFa ? "تازه‌سازی" : "Refresh"}
          </button>
          <Link href={isFa ? "/academy/trading-arena" : "/en/academy/trading-arena"} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white">
            <ChevronRight className={`h-3 w-3 ${isFa ? "" : "rotate-180"}`} /> {isFa ? "آرنا" : "Arena"}
          </Link>
        </div>
      </header>

      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4">
        <div className="flex items-start gap-3">
          <ServerCog className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
          <div>
            <p className="font-black text-cyan-100">{isFa ? "اجرا و بازتاب ژورنال از سرور معتبر خوانده می‌شوند." : "Execution and journal reflections are read from server authority."}</p>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-400">
              {isFa ? "موقعیت‌ها، سفارش‌ها، معاملات بسته‌شده و یادداشت‌های پس از معامله به حساب آکادمی متصل‌اند و در دستگاه‌های مختلف در دسترس می‌مانند." : "Positions, orders, closed trades and post-trade notes stay bound to the Academy account and remain available across devices."}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-200" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading && !snapshot && (
        <div className="flex min-h-[300px] items-center justify-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" />
        </div>
      )}

      {snapshot && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={isFa ? "خلاصه ژورنال" : "Journal summary"}>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black">{snapshot.state.openPositions.length}</p><p className="text-xs font-bold text-slate-500">{isFa ? "موقعیت باز" : "Open positions"}</p></div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black">{snapshot.state.pendingOrders.length}</p><p className="text-xs font-bold text-slate-500">{isFa ? "سفارش در انتظار" : "Pending orders"}</p></div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black text-emerald-300">{stats.closed ? Math.round((stats.wins / stats.closed) * 100) : 0}{isFa ? "٪" : "%"}</p><p className="text-xs font-bold text-slate-500">{isFa ? "نرخ برد بسته‌شده" : "Closed-trade win rate"}</p></div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center"><p className="text-xl font-black text-amber-300">{stats.riskFlags}</p><p className="text-xs font-bold text-slate-500">{isFa ? "معامله با هشدار رفتاری" : "Trades with behavioural warnings"}</p></div>
          </section>

          {snapshot.state.openPositions.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-cyan-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{isFa ? "برنامه‌های فعال" : "Active plans"}</h2></div>
              <div className="grid gap-4 lg:grid-cols-2">{snapshot.state.openPositions.map((position) => <OpenEvidence key={position.id} position={position} locale={locale} />)}</div>
            </section>
          )}

          {snapshot.state.pendingOrders.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2"><FileClock className="h-4 w-4 text-amber-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{isFa ? "تصمیم‌های در انتظار اجرا" : "Decisions awaiting execution"}</h2></div>
              <div className="grid gap-4 lg:grid-cols-2">{snapshot.state.pendingOrders.map((order) => <PendingEvidence key={order.id} order={order} locale={locale} />)}</div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{isFa ? "تاریخچه اجرای قطعی و بازتاب‌ها" : "Authoritative execution and reflection history"}</h2></div>
              <span className="text-xs font-black text-slate-600">{stats.closed} {isFa ? "رکورد" : "records"}</span>
            </div>
            {snapshot.state.closedTrades.length > 0 ? (
              <div className="space-y-4">
                {snapshot.state.closedTrades.map((trade) => (
                  <ClosedEvidence
                    key={trade.id}
                    trade={trade}
                    locale={locale}
                    reflection={reflections[trade.id] ?? null}
                    draft={drafts[trade.id] ?? reflectionDraftFromAuthoritative(reflections[trade.id] ?? null)}
                    pending={pendingIdentities[trade.id] ?? null}
                    saving={saving[trade.id] === true}
                    error={reflectionErrors[trade.id] ?? null}
                    onDraftChange={(draft) => setDrafts((current) => ({ ...current, [trade.id]: draft }))}
                    onSave={() => void saveReflection(trade)}
                    onRefresh={() => void loadReflections(snapshot.activeAttempt.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 p-10 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-slate-700" />
                <p className="mt-3 font-black text-slate-500">{isFa ? "هنوز معامله بسته‌شده‌ای ثبت نشده است." : "No closed trade has been recorded yet."}</p>
                <Link href={isFa ? "/academy/trading-arena" : "/en/academy/trading-arena"} className="mt-4 inline-flex items-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-slate-300">
                  {isFa ? "بازگشت به آرنا" : "Return to Arena"} <ChevronRight className={`h-4 w-4 ${isFa ? "rotate-180" : ""}`} />
                </Link>
              </div>
            )}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px] font-bold text-slate-600">
            <span>Attempt #{snapshot.activeAttempt.attemptNumber} · revision {snapshot.revision}</span>
            <span>{isFa ? "آخرین وضعیت" : "Latest state"}: {dateTime(snapshot.state.updatedAt, locale)}</span>
          </footer>
        </>
      )}

      {!loading && !snapshot && (
        <div className="rounded-[24px] border border-dashed border-white/10 p-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
          <p className="mt-3 font-black text-slate-400">{isFa ? "ژورنال سروری بازیابی نشد." : "The server journal could not be restored."}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-white">{isFa ? "تلاش دوباره" : "Try again"}</button>
        </div>
      )}
    </div>
  );
}
