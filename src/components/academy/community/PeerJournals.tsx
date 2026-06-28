"use client";

import { useEffect, useState } from "react";
import { BookOpen, Info, Lock, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import {
  loadCommunityProfile,
  updatePrivacy,
  type CommunityProfile,
} from "@/lib/community-profile";
import { loadJournal, MISTAKE_TAG_LABEL, type JournalEntry } from "@/lib/trading-journal";

// ─── Sanitized shared entry ───────────────────────────────────────────────────

interface SanitizedEntry {
  id: string;
  asset: string;
  setup: string;
  plan: string;
  mistakeTags: string[];
  lesson: string;
  mentorNote: string;
  sharedAt: number;
  isMyEntry: boolean;
  isDemoEntry: boolean;
}

function sanitizeForSharing(entry: JournalEntry): SanitizedEntry | null {
  if (!entry.completedAt) return null;
  if (!entry.lessonLearned && !entry.postReflection) return null;

  return {
    id: entry.id,
    asset: entry.asset,
    setup: entry.preTradePlan.slice(0, 200),           // truncated, no PII
    plan: entry.entryReason.slice(0, 150),
    mistakeTags: entry.mistakeTags,
    lesson: entry.lessonLearned.slice(0, 300),
    mentorNote: buildMentorNote(entry),
    sharedAt: entry.completedAt,
    isMyEntry: true,
    isDemoEntry: false,
  };
}

function buildMentorNote(entry: JournalEntry): string {
  const hasMistakes = entry.mistakeTags.length > 0;
  if (!hasMistakes) return "این معامله بدون علامت اشتباه ثبت شده — نشانه خوبی است.";
  const worst = entry.mistakeTags[0];
  const messages: Record<string, string> = {
    "no-stop-loss": "داشتن حد ضرر در هر معامله ضروری است. بدون آن ریسک کنترل نشده است.",
    "fomo": "FOMO یکی از اصلی‌ترین دشمنان معامله‌گر است. صبر بهتر از عجله است.",
    "revenge-trade": "معامله انتقامی پس از ضرر معمولاً ضررهای بیشتری می‌آورد. استراحت کنید.",
    "over-risk": "ریسک بیش از ۵٪ در یک معامله خطرناک است. اندازه موقعیت مهم است.",
    "impulse-entry": "ورود تکانشی بدون تحلیل معمولاً نتیجه خوبی ندارد.",
  };
  return messages[worst!] ?? "این نقطه ضعف را به عنوان فرصت یادگیری ببینید.";
}

// Demo shared entries from community
const DEMO_SHARED_ENTRIES: SanitizedEntry[] = [
  {
    id: "demo-1",
    asset: "BTC",
    setup: "قیمت به حمایت ۶۴۰۰۰ رسید و نشانه‌های برگشت دیدم.",
    plan: "خرید در حمایت با حد ضرر زیر ۶۳۵۰۰",
    mistakeTags: ["early-exit"],
    lesson: "زود از معامله خارج شدم و بقیه رشد را از دست دادم. باید بیشتر صبر کنم.",
    mentorNote: "خروج زودهنگام ضرر مستقیم ندارد ولی از سود بیشتر محروم می‌شوید. به برنامه اولیه‌تان اعتماد کنید.",
    sharedAt: Date.now() - 3 * 60 * 60 * 1000,
    isMyEntry: false,
    isDemoEntry: true,
  },
  {
    id: "demo-2",
    asset: "ETH",
    setup: "در نوسانات شبیه‌ساز سعی کردم آرامش خود را حفظ کنم.",
    plan: "صبر برای تثبیت قیمت، ورود با حد ضرر مشخص",
    mistakeTags: [],
    lesson: "حفظ آرامش در نوسان مهارتی است که با تمرین شکل می‌گیرد. امروز یک قدم بهتر بودم.",
    mentorNote: "این معامله بدون علامت اشتباه ثبت شده — نشانه خوبی است.",
    sharedAt: Date.now() - 6 * 60 * 60 * 1000,
    isMyEntry: false,
    isDemoEntry: true,
  },
  {
    id: "demo-3",
    asset: "BTC",
    setup: "قیمت با اخبار سریع بالا رفت. احساس FOMO داشتم.",
    plan: "می‌خواستم وارد شوم ولی صبر کردم. بعد قیمت ریخت.",
    mistakeTags: [],
    lesson: "یادگرفتم که FOMO را تشخیص دهم. وقتی احساس اضطرار می‌کنم، باید صبر کنم.",
    mentorNote: "مقاومت در برابر FOMO یکی از ارزشمندترین مهارت‌های معامله‌گری است.",
    sharedAt: Date.now() - 24 * 60 * 60 * 1000,
    isMyEntry: false,
    isDemoEntry: true,
  },
];

// ─── Shared entry card ────────────────────────────────────────────────────────

function SharedEntryCard({ entry }: { entry: SanitizedEntry }) {
  const timeAgo = (ms: number) => {
    const d = Math.floor((Date.now() - ms) / 60000);
    if (d < 60) return `${d} دقیقه پیش`;
    if (d < 1440) return `${Math.floor(d / 60)} ساعت پیش`;
    return `${Math.floor(d / 1440)} روز پیش`;
  };

  return (
    <div className={`rounded-[24px] border p-5 space-y-3 ${entry.isMyEntry ? "border-cyan-300/20 bg-cyan-400/5" : "border-white/10 bg-slate-900/60"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-800 text-xs font-black text-slate-400">
            {entry.asset[0]}
          </div>
          <span className="text-sm font-black">{entry.asset}</span>
          {entry.isMyEntry && <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[9px] font-black text-cyan-300">من</span>}
          {entry.isDemoEntry && <span className="rounded-sm bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">نمایشی</span>}
        </div>
        <span className="text-[10px] font-bold text-slate-600">{timeAgo(entry.sharedAt)}</span>
      </div>

      {entry.setup && (
        <div>
          <p className="text-xs font-black text-slate-500 mb-1">تنظیم:</p>
          <p className="text-sm font-bold text-slate-300">{entry.setup}</p>
        </div>
      )}

      {entry.mistakeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.mistakeTags.map((tag) => (
            <span key={tag} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
              {MISTAKE_TAG_LABEL[tag as keyof typeof MISTAKE_TAG_LABEL] ?? tag}
            </span>
          ))}
        </div>
      )}

      {entry.lesson && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
          <p className="text-xs font-black text-violet-300 mb-1">درس کلیدی</p>
          <p className="text-sm font-bold leading-7 text-violet-200">{entry.lesson}</p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold text-emerald-200">{entry.mentorNote}</p>
      </div>
    </div>
  );
}

// ─── Privacy toggle ───────────────────────────────────────────────────────────

function SharingToggle({ profile, onUpdate }: { profile: CommunityProfile; onUpdate: (p: CommunityProfile) => void }) {
  const enabled = profile.privacy.journalSharingEnabled;
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-black mb-1">اشتراک‌گذاری ژورنال (اختیاری)</p>
          <p className="text-xs font-bold leading-6 text-slate-400">
            با فعال کردن این گزینه، بازتاب‌های تکمیل‌شده شما (بدون اطلاعات شخصی) با جامعه به اشتراک گذاشته می‌شود. هر زمان می‌توانید غیرفعال کنید.
          </p>
          <p className="mt-2 text-xs font-bold text-slate-600">چه چیزی حذف می‌شود: نام واقعی، موجودی دقیق، نکات شخصی</p>
        </div>
        <button
          onClick={() => onUpdate(updatePrivacy(profile, { journalSharingEnabled: !enabled }))}
          className="shrink-0 focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-xl"
          aria-label={enabled ? "غیرفعال کردن اشتراک‌گذاری" : "فعال کردن اشتراک‌گذاری"}
          aria-checked={enabled}
          role="switch"
        >
          {enabled ? <ToggleRight className="h-8 w-8 text-cyan-400" /> : <ToggleLeft className="h-8 w-8 text-slate-600" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main PeerJournals ────────────────────────────────────────────────────────

export function PeerJournals() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [mySharedEntries, setMySharedEntries] = useState<SanitizedEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const p = loadCommunityProfile();
    setProfile(p);

    if (p?.privacy.journalSharingEnabled) {
      const journal = loadJournal();
      const shared = journal.flatMap((e) => {
        const s = sanitizeForSharing(e);
        return s ? [s] : [];
      });
      setMySharedEntries(shared);
    }
    setLoaded(true);
  }, []);

  const allEntries = [
    ...mySharedEntries,
    ...DEMO_SHARED_ENTRIES,
  ].sort((a, b) => b.sharedAt - a.sharedAt);

  if (!loaded) return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">ژورنال‌های مشترک</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">بازتاب‌های گمنام یادگیرندگان — بدون اطلاعات شخصی</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10">
          <BookOpen className="h-6 w-6 text-cyan-300" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="text-xs font-black text-amber-300 mb-1">حریم خصوصی اول</p>
          <p className="text-xs font-bold text-amber-200">همه اطلاعات شخصی از ژورنال‌های مشترک حذف می‌شود. اشتراک‌گذاری کاملاً اختیاری است.</p>
        </div>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-300 mb-3" />
          <p className="font-black text-amber-200">پروفایل جامعه لازم است</p>
        </div>
      ) : (
        <SharingToggle profile={profile} onUpdate={setProfile} />
      )}

      {/* Entries */}
      <div className="space-y-4">
        {allEntries.length > 0 ? (
          allEntries.map((entry) => <SharedEntryCard key={entry.id} entry={entry} />)
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 p-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-600 mb-3" />
            <p className="font-black text-slate-400">ژورنال‌های مشترک</p>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-600">
              وقتی اشتراک‌گذاری را فعال کنید و بازتاب ثبت کنید،<br />
              بازتاب‌های پاک‌شده اینجا نمایش داده می‌شوند.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
