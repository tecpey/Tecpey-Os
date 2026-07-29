"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Brain,
  Loader2,
  MessageCircleQuestion,
  Send,
  X,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  BookOpenCheck,
} from "lucide-react";
import { useMentorInsights } from "@/hooks/useMentorInsights";

type ChatMessage = { role: "user" | "assistant"; content: string; at: number };
type Locale = "fa" | "en";

type MentorProfile = {
  level: "beginner" | "intermediate" | "advanced";
  risk: "low" | "medium" | "high";
  weakArea: string;
  goal: string;
  lastScore: number;
  completedTerms: number[];
};

type MentorReply = {
  ok?: boolean;
  answer?: string;
  isReady?: boolean;
  relatedTerm?: { title: string; href: string };
  checklist?: string[];
  suggestedQuestions?: string[];
  sourceLessons?: { title: string; href: string }[];
};


const TELEGRAM_URL = "https://t.me/tecpey";

const faQuestions = [
  "Seed Phrase را چطور امن نگه دارم؟",
  "Market Order چه زمانی خطرناک می‌شود؟",
  "اگر RSI بالا بود حتماً باید بفروشم؟",
  "برای یک معامله فرضی، چک‌لیست مدیریت ریسک بساز.",
];

const enQuestions = [
  "How should I protect my seed phrase?",
  "When can a market order become risky?",
  "Does a high RSI always mean sell?",
  "Build a risk-management checklist for a sample trade.",
];

function getLocale(pathname: string): Locale {
  return pathname.startsWith("/en") ? "en" : "fa";
}

function getPageContext(pathname: string, locale: Locale) {
  const cleanPath = pathname || "/";
  const faLabels: { test: RegExp; label: string }[] = [
    { test: /academy\/term-(\d+)/, label: "ترم آکادمی" },
    { test: /academy/, label: "آکادمی" },
    { test: /crypto-news/, label: "اخبار رمزارز" },
    { test: /markets/, label: "بازارها" },
    { test: /security/, label: "امنیت" },
    { test: /coins|crypto\//, label: "رمزارزها" },
  ];
  const enLabels: { test: RegExp; label: string }[] = [
    { test: /academy\/term-(\d+)/, label: "Academy term" },
    { test: /academy/, label: "Academy" },
    { test: /crypto-news/, label: "Crypto news" },
    { test: /markets/, label: "Markets" },
    { test: /security/, label: "Security" },
    { test: /coins|crypto\//, label: "Crypto assets" },
  ];
  const labels = locale === "en" ? enLabels : faLabels;
  const matched = labels.find((item) => item.test.test(cleanPath));
  const termMatch = cleanPath.match(/term-(\d+)/);
  const termText = termMatch ? ` ${termMatch[1]}` : "";
  return {
    path: cleanPath,
    section: matched ? `${matched.label}${termText}` : locale === "en" ? "current page" : "صفحه فعلی",
  };
}

// Tag label maps — keyed by server tag string, value is [fa, en].
// Add entries here when new tags are introduced in mentor-signals.ts.
const TAG_LABELS: Record<string, [string, string]> = {
  // Weak area tags
  quiz_review: ["مرور آزمون", "Quiz Review"],
  risk_control: ["کنترل ریسک", "Risk Control"],
  risk_discipline: ["انضباط ریسک", "Risk Discipline"],
  fomo_management: ["کنترل FOMO", "FOMO Management"],
  revenge_trading: ["معامله انتقامی", "Revenge Trading"],
  journal_quality: ["کیفیت ژورنال", "Journal Quality"],
  emotional_control: ["کنترل احساسات", "Emotional Control"],
  // Strong area tags
  learning_consistency: ["ثبات یادگیری", "Learning Consistency"],
  trade_discipline: ["انضباط معامله", "Trade Discipline"],
  clean_risk_record: ["ریسک پاک", "Clean Risk Record"],
  quiz_mastery: ["تسلط آزمون", "Quiz Mastery"],
  practice_commitment: ["تعهد تمرین", "Practice Commitment"],
  // Primary goal tags
  safe_spot_trading: ["ورود امن به معامله اسپات", "Safe Spot Trading"],
  passive_income: ["درآمد غیرفعال", "Passive Income"],
  futures_trading: ["معامله فیوچرز", "Futures Trading"],
  academy_completion: ["تکمیل آکادمی", "Academy Completion"],
  professional_trading: ["معامله حرفه‌ای", "Professional Trading"],
};

/** Convert a server tag string to a locale-aware human-readable label. */
function formatMentorTag(tag: string, locale: Locale): string {
  if (!tag) return "";
  const isEn = locale === "en";

  const termRetry = tag.match(/^term_(\d+)_retry$/);
  if (termRetry) return isEn ? `Retry Term ${termRetry[1]}` : `مرور ترم ${termRetry[1]}`;

  const topic = tag.match(/^topic_(.+)$/);
  if (topic) {
    const slug = topic[1].replace(/-/g, " ");
    return slug; // lesson slugs are locale-neutral
  }

  const pair = TAG_LABELS[tag];
  if (pair) return isEn ? pair[1] : pair[0];

  // Graceful fallback: prettify unknown tags rather than showing raw slugs.
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LEARNING_STYLE_LABELS: Record<string, [string, string]> = {
  analytical: ["تحلیلی", "Analytical Learner"],
  practical: ["عملی", "Practical Learner"],
  mixed: ["ترکیبی", "Mixed Learner"],
};

function formatLearningStyle(style: string, locale: Locale): string {
  const pair = LEARNING_STYLE_LABELS[style];
  return pair ? (locale === "en" ? pair[1] : pair[0]) : style;
}

function defaultMentorProfile(locale: Locale): MentorProfile {
  return {
    level: "beginner",
    risk: "medium",
    weakArea: locale === "en" ? "risk management" : "مدیریت ریسک",
    goal: locale === "en" ? "safe spot trading" : "ورود امن به معامله اسپات",
    lastScore: 72,
    completedTerms: [1],
  };
}

function mentorProfileLabel(profile: MentorProfile, locale: Locale) {
  const isEn = locale === "en";
  const levelLabel = {
    beginner: isEn ? "Beginner" : "مبتدی",
    intermediate: isEn ? "Intermediate" : "متوسط",
    advanced: isEn ? "Advanced" : "پیشرفته",
  }[profile.level];

  const riskLabel = {
    low: isEn ? "Low" : "کم",
    medium: isEn ? "Medium" : "متوسط",
    high: isEn ? "High" : "زیاد",
  }[profile.risk];

  return { levelLabel, riskLabel };
}

function mentorLearningReadiness(profile: MentorProfile, locale: Locale) {
  const isEn = locale === "en";
  const base = Math.max(0, Math.min(100, Number(profile.lastScore || 0)));
  const riskPenalty = profile.risk === "high" ? 12 : profile.risk === "medium" ? 6 : 0;
  const levelBonus = profile.level === "advanced" ? 8 : profile.level === "intermediate" ? 4 : 0;
  const score = Math.max(0, Math.min(100, base - riskPenalty + levelBonus));

  if (score >= 82) {
    return {
      score,
      tone: "ready",
      label: isEn ? "Ready for guided practice" : "آماده تمرین هدایت‌شده",
      note: isEn ? "Use a small educational scenario and define invalidation first." : "با سناریوی آموزشی کوچک شروع کن و اول نقطه ابطال را مشخص کن.",
    };
  }

  if (score >= 65) {
    return {
      score,
      tone: "caution",
      label: isEn ? "Practice only" : "فقط تمرین",
      note: isEn ? "Review risk management before any real decision." : "قبل از هر تصمیم واقعی، مدیریت ریسک را مرور کن.",
    };
  }

  return {
    score,
    tone: "pause",
    label: isEn ? "Pause real trading" : "توقف معامله واقعی",
    note: isEn ? "Focus on psychology, capital protection and academy review today." : "امروز روی روانشناسی، حفظ سرمایه و مرور آکادمی تمرکز کن.",
  };
}

function mentorQuickActions(locale: Locale, section: string, profile: MentorProfile) {
  const isEn = locale === "en";
  const weakLabel = formatMentorTag(profile.weakArea, locale);
  return isEn
    ? [
        `Am I ready to trade today? My score is ${profile.lastScore}/100 and my weak area is ${weakLabel}.`,
        `Give me my next learning step for ${section}.`,
        `Explain the most common mistake for my level: ${profile.level}.`,
        `Connect this page to related Crypto Wiki lessons.`,
      ]
    : [
        `امروز اجازه معامله دارم؟ نمره من ${profile.lastScore} از ۱۰۰ است و ضعف اصلی من ${weakLabel} است.`,
        `قدم بعدی یادگیری من در بخش ${section} چیست؟`,
        `اشتباه رایج سطح ${profile.level === "beginner" ? "مبتدی" : profile.level === "intermediate" ? "متوسط" : "پیشرفته"} من چیست؟`,
        `این صفحه را به درس‌ها و واژه‌های مرتبط Crypto Wiki وصل کن.`,
      ];
}

function fallbackAnswer(question: string, locale: Locale, section: string): MentorReply {
  const isEn = locale === "en";
  const answer = isEn
    ? `I am here with you on ${section}. I cannot give buy/sell signals or guaranteed profit advice, but I can help you understand the concept, identify the risk, and choose the next learning step.\n\nFor your question: "${question}", start by separating the concept from the decision. Define the idea in simple words, list the main risk, then use a small checklist before taking any action.`
    : `من همین‌جا در ${section} کنار تو هستم. سیگنال خرید و فروش یا وعده سود نمی‌دهم، اما کمک می‌کنم مفهوم را بفهمی، سبک ریسک را ببینی و قدم بعدی یادگیری را انتخاب کنی.\n\nبرای سؤال «${question}»، اول مفهوم را از تصمیم مالی جدا کن. تعریف ساده را بنویس، ریسک اصلی را مشخص کن و بعد با یک چک‌لیست کوتاه تصمیم را بررسی کن.`;

  return {
    answer,
    isReady: false,
    checklist: isEn
      ? [
          "Define the concept in one sentence",
          "Name the main risk",
          "Find the related academy lesson",
          "Do not share private keys or seed phrases",
        ]
      : [
          "مفهوم را در یک جمله تعریف کن",
          "ریسک اصلی را مشخص کن",
          "درس مرتبط آکادمی را مرور کن",
          "Seed Phrase، رمز عبور یا کلید خصوصی را ارسال نکن",
        ],
    suggestedQuestions: isEn ? enQuestions.slice(0, 3) : faQuestions.slice(0, 3),
  };
}

function normalizeReply(data: MentorReply, question: string, locale: Locale, section: string): MentorReply {
  if (data?.answer) return data;
  return fallbackAnswer(question, locale, section);
}

export function GlobalAiMentorWidget() {
  const pathname = usePathname() || "/";
  const locale = getLocale(pathname);
  const isEn = locale === "en";
  const pageContext = useMemo(() => getPageContext(pathname, locale), [pathname, locale]);
  const suggestions = isEn ? enQuestions : faQuestions;

  // Server-driven mentor profile and insights (Phase 7).
  const { data: mentorData, error: insightsError } = useMentorInsights();
  const serverProfile = mentorData?.profile ?? null;

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [profile, setProfile] = useState<MentorProfile>(() => defaultMentorProfile(locale));
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [academyProfileReady, setAcademyProfileReady] = useState(false);
  const [academyDisplayName, setAcademyDisplayName] = useState("");
  const [academyChecked, setAcademyChecked] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Prevent repeated server-to-state syncs after the user has manually changed level/risk.
  const serverSyncedRef = useRef(false);


  useEffect(() => {
    let active = true;
    const checkProfile = async () => {
      try {
        const response = await fetch("/api/academy-student-profile", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        const ready = Boolean(data?.profile?.display_name);
        const name = data?.profile?.display_name || "";
        setAcademyProfileReady(ready);
        setAcademyDisplayName(name);
      } catch {
        if (active) setAcademyProfileReady(false);
      } finally {
        if (active) setAcademyChecked(true);
      }
    };
    void checkProfile();
    window.addEventListener("tecpey-academy-profile-ready", checkProfile);
    window.addEventListener("focus", checkProfile);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-profile-ready", checkProfile);
      window.removeEventListener("focus", checkProfile);
    };
  }, []);

  // One-shot migration: import old localStorage chat history into server DB (Phase 8).
  // Runs once when the academy profile is confirmed ready. After migration the local
  // copies are cleared and the migration flag is set so this never repeats.
  useEffect(() => {
    if (!academyProfileReady) return;
    const MIGRATION_FLAG = "tecpey-mentor-chat-migrated-v1";
    try {
      if (window.localStorage.getItem(MIGRATION_FLAG)) return;
      const fa = JSON.parse(window.localStorage.getItem("tecpey-global-ai-mentor-history-fa") || "[]");
      const en = JSON.parse(window.localStorage.getItem("tecpey-global-ai-mentor-history-en") || "[]");
      const messages = [...(Array.isArray(fa) ? fa : []), ...(Array.isArray(en) ? en : [])]
        .filter((m) => m?.role && m?.content && typeof m.at === "number");

      // Set the flag first so we don't retry even if the fetch fails.
      window.localStorage.setItem(MIGRATION_FLAG, "1");

      if (!messages.length) return;

      void fetch("/api/mentor-conversations/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.slice(0, 50) }),
      })
        .then((r) => {
          if (r.ok) {
            try {
              window.localStorage.removeItem("tecpey-global-ai-mentor-history-fa");
              window.localStorage.removeItem("tecpey-global-ai-mentor-history-en");
            } catch {
              // localStorage removal is best-effort.
            }
          }
        })
        .catch(() => {
          // Silent — migration failure is non-critical.
        });
    } catch {
      // Never break the widget on migration error.
    }
  }, [academyProfileReady]);

  // Load chat history from server whenever the widget opens (Phase 8).
  // Fetches the most-recent 30 turns. Silent on error — widget works with empty history.
  useEffect(() => {
    if (!open || !academyProfileReady) return;

    let active = true;
    setHistoryLoading(true);

    type ServerConv = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
    fetch("/api/mentor-conversations?limit=30", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok?: boolean; conversations?: ServerConv[] }) => {
        if (!active) return;
        if (data.ok && Array.isArray(data.conversations)) {
          // API returns DESC (newest first); reverse to chronological for display.
          setHistory(
            data.conversations
              .slice()
              .reverse()
              .map((c) => ({
                role: c.role,
                content: c.content,
                at: new Date(c.createdAt).getTime(),
              })),
          );
        }
      })
      .catch(() => {
        // Silent fallback: widget shows empty history and works normally.
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, academyProfileReady]);


  // One-time sync from server mentor_profiles into local profile state.
  // Runs on first successful fetch; subsequent button-clicks (level, risk) override ephemerally.
  useEffect(() => {
    if (!serverProfile || serverSyncedRef.current) return;
    serverSyncedRef.current = true;
    setProfile((prev) => ({
      ...prev,
      level: serverProfile.level,
      risk: serverProfile.riskProfile,
      weakArea: serverProfile.weakAreas[0] ?? prev.weakArea,
      goal: serverProfile.primaryGoal ?? prev.goal,
      lastScore: serverProfile.confidenceScore,
    }));
  }, [serverProfile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ question?: string }>;
      setOpen(true);
      if (custom.detail?.question) setQuestion(custom.detail.question);
      window.setTimeout(() => textareaRef.current?.focus(), 120);
    };

    window.addEventListener("tecpey:open-ai-mentor", handler);
    return () => window.removeEventListener("tecpey:open-ai-mentor", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 80);
  }, [history, loading, streaming, open]);

  function fillSuggestion(value: string) {
    setOpen(true);
    setSuggestionsOpen(false);
    void ask(value);
  }

  function streamAssistant(content: string) {
    const finalText = content.trim() || (isEn ? "The mentor is preparing an educational answer. Please try again." : "مربی هوشمند در حال آماده‌سازی پاسخ آموزشی است. لطفاً دوباره تلاش کن.");
    const id = Date.now();

    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setStreaming(true);
    setHistory((items) => [...items, { role: "assistant" as const, content: "", at: id }].slice(-30));

    let index = 0;
    const step = Math.max(3, Math.ceil(finalText.length / 120));
    typingTimerRef.current = setInterval(() => {
      index = Math.min(finalText.length, index + step);
      const visibleText = finalText.slice(0, index);
      setHistory((items) =>
        items.map((item) => (item.at === id ? { ...item, content: visibleText } : item)).slice(-30),
      );

      if (index >= finalText.length) {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setStreaming(false);
      }
    }, 18);
  }

  async function ask(providedQuestion?: string) {
    if (!academyProfileReady) {
      setOpen(true);
      return;
    }
    const cleanQuestion = (providedQuestion ?? question).trim();
    if (!cleanQuestion || loading || streaming) return;

    const userMessage: ChatMessage = { role: "user", content: cleanQuestion, at: Date.now() };
    setHistory((items) => [...items, userMessage].slice(-30));
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          locale,
          page: pageContext.path,
          section: pageContext.section,
          history: history.slice(-6).map((item) => ({ role: item.role, content: item.content })),
          mentorMode: "coach",
          progress: {
            displayName: academyDisplayName,
            completedTerms: profile.completedTerms,
            weakAreas: serverProfile?.weakAreas ?? [profile.weakArea],
            confidence: serverProfile?.confidenceScore ?? profile.lastScore,
            riskProfile: serverProfile?.riskProfile ?? profile.risk,
            goal: serverProfile?.primaryGoal ?? profile.goal,
            level: serverProfile?.level ?? profile.level,
          },
        }),
      });

      const data = normalizeReply((await response.json()) as MentorReply, cleanQuestion, locale, pageContext.section);
      const answerParts = [data.answer || fallbackAnswer(cleanQuestion, locale, pageContext.section).answer];

      if (data.checklist?.length) {
        answerParts.push(
          isEn
            ? `\nChecklist:\n${data.checklist.map((item) => `• ${item}`).join("\n")}`
            : `\nچک‌لیست:\n${data.checklist.map((item) => `• ${item}`).join("\n")}`,
        );
      }

      if (data.relatedTerm?.title) {
        answerParts.push(
          isEn
            ? `\nRelated lesson: ${data.relatedTerm.title}`
            : `\nدرس مرتبط: ${data.relatedTerm.title}`,
        );
      }

      streamAssistant(answerParts.filter(Boolean).join("\n"));
    } catch {
      const safe = fallbackAnswer(cleanQuestion, locale, pageContext.section);
      streamAssistant(safe.answer || (isEn ? "The mentor is preparing an educational answer. Please try again." : "مربی هوشمند در حال آماده‌سازی پاسخ آموزشی است. لطفاً دوباره تلاش کن."));
    } finally {
      setLoading(false);
    }
  }

  const profileLabel = mentorProfileLabel(profile, locale);
  const readiness = mentorLearningReadiness(profile, locale);
  const coachActions = mentorQuickActions(locale, pageContext.section, profile);

  if (!academyChecked || !academyProfileReady) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-3 z-[90] inline-flex max-w-[42vw] items-center justify-center gap-1.5 rounded-2xl border border-cyan-300/40 bg-slate-950/95 px-3 py-2.5 text-[10.5px] font-black text-cyan-50 shadow-[0_18px_60px_rgba(34,211,238,.30)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-cyan-950/95 sm:bottom-5 sm:left-5 sm:max-w-[calc(100vw-2rem)] sm:gap-2 sm:px-4 sm:py-3 sm:text-xs"
        aria-label={isEn ? "Ask TecPey learning mentor" : "از مربی آموزشی تک‌پی بپرس"}
      >
        <MessageCircleQuestion className="h-5 w-5 shrink-0 text-cyan-300" />
        <span className="truncate">{isEn ? "Ask mentor" : "از مربی بپرس"}</span>
      </button>

      {open ? (
        <div
          className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] z-[95] mx-auto max-w-[440px] sm:bottom-5 sm:left-5 sm:right-auto sm:mx-0 sm:w-[420px]"
          dir={isEn ? "ltr" : "rtl"}
        >
          <div className="flex max-h-[min(72dvh,560px)] flex-col overflow-hidden rounded-[24px] border border-cyan-300/25 bg-slate-950/98 text-white shadow-[0_28px_100px_rgba(0,0,0,.60)] backdrop-blur-2xl sm:max-h-[min(82vh,680px)] sm:rounded-[28px]">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-cyan-400/10 p-3 sm:p-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200 sm:h-10 sm:w-10">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black sm:text-sm">{isEn ? "TecPey Learning Mentor" : "مربی آموزشی تک‌پی"}</p>
                  <p className="truncate text-[10px] font-bold text-cyan-100/80 sm:text-[11px]">
                    {isEn ? `With you on: ${pageContext.section}` : `همراه تو در: ${pageContext.section}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-200 transition hover:bg-white/10"
                aria-label={isEn ? "Close chat" : "بستن چت"}
                title={isEn ? "Close" : "بستن"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!academyProfileReady ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-center">
                  <ShieldCheck className="mx-auto h-10 w-10 text-amber-200" />
                  <h3 className="mt-4 text-xl font-black">{isEn ? "Mentor activates after academy profile" : "منتور بعد از ساخت پروفایل آکادمی فعال می‌شود"}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-200">
                    {isEn
                      ? "Create your academy identity first so the mentor can know your display name, learning path, term progress and weak topics."
                      : "اول هویت آموزشی خودت را بساز تا منتور با نام انتخابی تو، مسیر ترم‌ها، پیشرفت و نقاط ضعف واقعی‌ات کار کند."}
                  </p>
                  <a href={isEn ? "/en/academy/onboarding" : "/academy/onboarding"} className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-5 py-3 text-sm font-black text-white">
                    {isEn ? "Create academy profile" : "ساخت پروفایل آکادمی"}
                  </a>
                  <p className="mt-3 text-[11px] font-bold text-slate-400">
                    {academyChecked ? (isEn ? "Smart Center, mentor and terms unlock after profile creation." : "مرکز هوشمند، منتور و ترم‌ها بعد از ساخت پروفایل فعال می‌شوند.") : (isEn ? "Checking profile…" : "در حال بررسی پروفایل…")}
                  </p>
                </div>
              </div>
            ) : (
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              {historyLoading && history.length === 0 ? (
                <div className="flex flex-col gap-2 pt-1">
                  {[80, 55, 70].map((w, i) => (
                    <div
                      key={i}
                      className={`h-9 animate-pulse rounded-3xl bg-white/[0.055] ${i % 2 === 0 ? "self-end" : "self-start"}`}
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-3xl border border-cyan-300/20 bg-white/[0.055] p-3 text-xs font-bold leading-6 text-slate-100 sm:p-4 sm:text-sm sm:leading-7">
                  <div className="mb-2 flex items-center gap-2 text-cyan-200">
                    <Sparkles className="h-4 w-4" />
                    {isEn ? "Ask without leaving the page" : "بدون ترک صفحه سؤال بپرس"}
                  </div>
                  <p>
                    {isEn
                      ? "I can explain concepts, security risks, academy lessons and next steps. I do not give buy/sell signals or guaranteed profit advice."
                      : "می‌توانم مفهوم‌ها، ریسک‌های امنیتی، درس‌های آکادمی و قدم بعدی را توضیح بدهم. سیگنال خرید و فروش یا وعده سود نمی‌دهم."}
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded-2xl bg-emerald-400/10 p-2.5 text-emerald-100">
                    <ShieldCheck className="h-4 w-4" />
                    {isEn ? "Never send seed phrase, password or API key." : "Seed Phrase، رمز عبور یا کلیدهای محرمانه را ارسال نکن."}
                  </div>
                  <div className="mt-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-2.5 text-[11px] leading-5 text-cyan-50">
                    <div className="mb-1 flex items-center justify-between gap-2 font-black">
                      <span>{isEn ? "Learning profile" : "پرونده یادگیری"}</span>
                      <span className="rounded-full bg-slate-950/45 px-2 py-0.5 text-[10px] text-cyan-100">{readiness.score}/100</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-slate-100/90">
                      <span>{isEn ? "Level" : "سطح"}: {profileLabel.levelLabel}</span>
                      <span>{isEn ? "Risk style" : "سبک ریسک"}: {profileLabel.riskLabel}</span>
                      <span className="col-span-2">{isEn ? "Focus" : "تمرکز"}: {formatMentorTag(profile.weakArea, locale)}</span>
                      <span className="col-span-2">{isEn ? "Goal" : "هدف"}: {formatMentorTag(profile.goal, locale)}</span>
                    </div>
                    <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/35 p-2">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-black">
                        <span>{readiness.label}</span>
                        <span>{isEn ? "Learning readiness" : "آمادگی یادگیری"}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-cyan-300" style={{ width: `${readiness.score}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-200/90">{readiness.note}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {(["beginner", "intermediate", "advanced"] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setProfile((item) => ({ ...item, level }))}
                          className="rounded-xl border border-white/10 bg-white/5 px-1.5 py-1 text-[9px] font-black text-cyan-50 transition hover:bg-white/10"
                        >
                          {level === "beginner" ? (isEn ? "Beginner" : "مبتدی") : level === "intermediate" ? (isEn ? "Mid" : "متوسط") : (isEn ? "Advanced" : "حرفه‌ای")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Learning DNA — server-driven, Phase 7 ── */}
                  {serverProfile && (serverProfile.weakAreas.length > 0 || serverProfile.strongAreas.length > 0) ? (
                    <div className="mt-2 rounded-2xl border border-violet-300/20 bg-violet-400/5 p-2.5 text-[11px] leading-5">
                      <div className="mb-2 flex items-center gap-1.5 font-black text-violet-200">
                        <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                        {isEn ? "Learning DNA" : "پروفایل یادگیری"}
                      </div>

                      {serverProfile.strongAreas.length > 0 ? (
                        <div className="mb-2">
                          <div className="mb-1 font-black text-emerald-300">{isEn ? "Strong Areas" : "نقاط قوت"}</div>
                          <div className="flex flex-wrap gap-1">
                            {serverProfile.strongAreas.map((tag) => (
                              <span key={tag} className="rounded-lg bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-black text-emerald-200">
                                {formatMentorTag(tag, locale)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {serverProfile.weakAreas.length > 0 ? (
                        <div className="mb-2">
                          <div className="mb-1 font-black text-amber-300">{isEn ? "Weak Areas" : "نقاط ضعف"}</div>
                          <div className="flex flex-wrap gap-1">
                            {serverProfile.weakAreas.map((tag) => (
                              <span key={tag} className="rounded-lg bg-amber-400/15 px-2 py-0.5 text-[9.5px] font-black text-amber-200">
                                {formatMentorTag(tag, locale)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {serverProfile.learningStyle ? (
                        <div className="mb-2">
                          <div className="mb-1 font-black text-slate-300">{isEn ? "Learning Style" : "سبک یادگیری"}</div>
                          <span className="rounded-lg bg-cyan-400/10 px-2 py-0.5 text-[9.5px] font-black text-cyan-200">
                            {formatLearningStyle(serverProfile.learningStyle, locale)}
                          </span>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1 text-[9.5px] font-black text-slate-300">
                            <span>{isEn ? "Confidence" : "اعتماد به نفس"}</span>
                            <span className="text-cyan-200">{serverProfile.confidenceScore}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${serverProfile.confidenceScore}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1 text-[9.5px] font-black text-slate-300">
                            <span>{isEn ? "Discipline" : "انضباط"}</span>
                            <span className="text-violet-200">{serverProfile.disciplineScore}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-violet-400" style={{ width: `${serverProfile.disciplineScore}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : insightsError ? (
                    <div className="mt-2 rounded-2xl border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-[10px] font-bold text-slate-400">
                      {isEn ? "Mentor profile unavailable" : "پروفایل مربی در دسترس نیست"}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {history.map((item, index) => (
                <div key={`${item.at}-${index}`} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      item.role === "user"
                        ? "max-w-[88%] rounded-3xl bg-cyan-500 px-3 py-2.5 text-xs font-bold leading-6 text-white sm:px-4 sm:py-3 sm:text-sm sm:leading-7"
                        : "max-w-[92%] whitespace-pre-line rounded-3xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-xs font-bold leading-6 text-slate-100 sm:px-4 sm:py-3 sm:text-sm sm:leading-7"
                    }
                  >
                    {item.content}
                  </div>
                </div>
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.07] px-4 py-3 text-xs font-black text-cyan-100 sm:text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isEn ? "Preparing an educational answer..." : "در حال آماده‌سازی پاسخ آموزشی..."}
                  </div>
                </div>
              ) : null}
            </div>
            )}

            {academyProfileReady ? (
            <div className="shrink-0 border-t border-white/10 bg-slate-950/95 p-3 sm:p-4">
              <div className="relative mb-2">
                <button
                  type="button"
                  onClick={() => setSuggestionsOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2.5 text-xs font-black text-cyan-50 transition hover:bg-cyan-300/20"
                  aria-expanded={suggestionsOpen}
                >
                  <span>{isEn ? "Suggested questions" : "پرسش‌های پیشنهادی"}</span>
                  <ChevronDown className={`h-4 w-4 transition ${suggestionsOpen ? "rotate-180" : ""}`} />
                </button>

                {suggestionsOpen ? (
                  <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-52 overflow-y-auto rounded-3xl border border-cyan-300/25 bg-slate-950/98 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    {[...suggestions, ...coachActions].slice(0, 10).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => fillSuggestion(item)}
                        className="mb-1.5 block w-full rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-start text-[10.5px] font-black leading-5 text-slate-100 transition last:mb-0 hover:border-cyan-300/35 hover:bg-cyan-300/10"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[10px] font-black text-slate-300">
                <span>{isEn ? "Risk profile" : "سبک ریسک‌پذیری"}</span>
                <div className="flex gap-1">
                  {(["low", "medium", "high"] as const).map((risk) => (
                    <button
                      key={risk}
                      type="button"
                      onClick={() => setProfile((item) => ({ ...item, risk }))}
                      className="rounded-xl border border-cyan-300/10 bg-cyan-300/10 px-2 py-1 text-[9px] text-cyan-50 transition hover:bg-cyan-300/20"
                    >
                      {risk === "low" ? (isEn ? "Low" : "کم") : risk === "medium" ? (isEn ? "Med" : "متوسط") : (isEn ? "High" : "زیاد")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      ask();
                    }
                  }}
                  rows={2}
                  placeholder={isEn ? "Ask your learning question..." : "سؤال آموزشی‌ات را بنویس..."}
                  className="min-h-[50px] flex-1 resize-none rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-xs font-bold leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 sm:min-h-[54px] sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => ask()}
                  disabled={loading || streaming || !question.trim()}
                  className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-2xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[54px] sm:w-[54px]"
                  aria-label={isEn ? "Send" : "ارسال"}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isEn ? "Telegram support" : "پشتیبانی تلگرام"}
                  title={isEn ? "Telegram support" : "پشتیبانی تلگرام"}
                  className="inline-flex h-[50px] min-w-[50px] items-center justify-center gap-1.5 rounded-2xl border border-sky-300/35 bg-sky-500/10 px-3 text-[10px] font-black text-sky-100 shadow-[0_0_16px_rgba(56,189,248,.12)] transition hover:border-sky-200 hover:bg-sky-500/20 sm:h-[54px] sm:min-w-[54px] sm:text-[11px]"
                >
                  <svg viewBox="0 0 240 240" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true">
                    <circle cx="120" cy="120" r="120" fill="#229ED9" />
                    <path fill="#fff" d="M51.7 116.2c35-15.2 58.3-25.3 70-30.2 33.4-13.9 40.4-16.3 44.9-16.4 1 0 3.2.2 4.7 1.4 1.2 1 1.5 2.4 1.7 3.4.2 1 .4 3.1.2 4.8-2.1 22.1-11.2 75.8-15.8 100.6-1.9 10.5-5.7 14-9.4 14.4-8 .7-14.1-5.3-21.9-10.4-12.2-8-19.1-13-30.9-20.8-13.7-9-4.8-14 3-22.1 2-2.1 37.5-34.4 38.2-37.3.1-.4.2-1.8-.7-2.5-.9-.7-2.1-.5-3.1-.3-1.3.3-22 14-62.1 41.1-5.9 4-11.2 6-16 5.9-5.3-.1-15.4-3-22.9-5.4-9.2-3-16.5-4.6-15.9-9.7.3-2.6 4.3-5.3 12-8.5Z" />
                  </svg>
                  <span>{isEn ? "Support" : "پشتیبانی"}</span>
                </a>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                <BookOpenCheck className="h-3.5 w-3.5 text-cyan-300" />
                {isEn ? "Educational support only; not financial advice." : "پشتیبانی آموزشی است؛ مشاوره سرمایه‌گذاری نیست."}
              </div>
            </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
