"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  ChartNoAxesCombined,
  CheckCircle2,
  Crown,
  ChevronDown,
  ArrowUpRight,
  ExternalLink,
  History,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MentorArenaDock } from "@/components/mentor/MentorArenaDock";
import { MentorOfficeScene } from "@/components/mentor/MentorOfficeScene";
import { LivingMentorAvatar } from "@/components/mentor/LivingMentorAvatar";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";
import { useMentorInsights } from "@/hooks/useMentorInsights";
import {
  detectMentorMode,
  toLocalReply,
  type MentorLocale,
  type MentorReply,
} from "@/lib/academy-ai-mentor-core";
import {
  directMentorStage,
  mentorStageEventForWorkspaceActivity,
  type MentorArenaPanelState,
} from "@/lib/mentor-stage-director";
import {
  canUseMentorWorkspaceSurface,
  mentorResearchModeForSurface,
  mentorWorkspaceDirection,
  type MentorWorkspacePlan,
  type MentorWorkspaceSurface,
} from "@/lib/mentor-workspace";
import styles from "./AiMentorExperience.module.css";

type MentorThread = {
  id: string;
  title: string;
  locale: MentorLocale;
  status: "active" | "archived";
  lastMessageAt: string;
};

type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  reply?: MentorReply;
};

type AiMentorExperienceProps = {
  locale?: string;
  plan?: MentorWorkspacePlan;
};

const COPY = {
  fa: {
    eyebrow: "فضای کاری شخصی شما",
    title: "منتور هوشمند تک‌پی",
    subtitle: "فضایی برای یادگیری، پرسیدن و ادامه‌دادن گفت‌وگوهای قبلی.",
    freePlan: "نسخه پایه",
    premiumPlan: "نسخه پرمیوم",
    safety: "آموزشی و ریسک‌محور",
    history: "گفت‌وگوهای قبلی",
    historyDescription: "گفت‌وگوهای ذخیره‌شده را از همان‌جا ادامه بده.",
    office: "دفتر منتور",
    hideOffice: "جمع‌کردن دفتر منتور",
    privacyLink: "حریم خصوصی",
    support: "پشتیبانی",
    welcome: "یک سؤال، یک قدم روشن‌تر.",
    welcomeText: "مفهوم را بفهم، تصمیم را تمرین کن و با آگاهی جلو برو. از یکی از این مسیرها شروع کن یا سؤال خودت را بنویس.",
    draftHint: "پیشنهادها فقط متن سؤال را آماده می‌کنند؛ ارسال با شماست.",
    learnTitle: "ساده‌تر یاد بگیر",
    learnText: "یک مفهوم، یک مثال، یک تمرین",
    learnPrompt: "تفاوت نگهداری رمزارز در کیف پول شخصی و صرافی را با یک مثال ساده توضیح بده و یک سؤال برای سنجش فهم من بپرس.",
    riskTitle: "تصمیمت را مرور کن",
    riskText: "قبل از تمرین، ریسک را روشن کن",
    riskPrompt: "برای یک معامله فرضی، چک‌لیست دلیل ورود، نقطه ابطال و مدیریت ریسک بساز. هیچ پیشنهاد خرید یا فروش نده.",
    practiceTitle: "دانشت را امتحان کن",
    practiceText: "یک موقعیت آموزشی، بدون پول واقعی",
    practicePrompt: "یک سناریوی آموزشی درباره فومو بساز. ابتدا از من بخواه تصمیمم را توضیح بدهم و بعد بازخورد بده؛ معامله واقعی پیشنهاد نکن.",
    modeLabel: "حالت گفت‌وگو",
    historyUnavailable: "تاریخچه فعلاً در دسترس نیست؛ گفت‌وگوی جاری بدون ادعای ذخیره ادامه می‌یابد.",
    historyEmpty: "هنوز گفت‌وگویی ثبت نشده است.",
    newConversation: "گفت‌وگوی جدید",
    closeHistory: "بستن تاریخچه",
    conversation: "گفت‌وگو با منتور",
    emptyTitle: "من اینجا هستم؛ از همان جایی که هستی شروع می‌کنیم.",
    emptyText: "یک سؤال آموزشی، امنیتی یا مدیریت ریسک بپرس. برای پژوهش وب و سوشال، نمایشگر پرمیوم مربوط را انتخاب کن.",
    starterQuestions: "چند شروع پیشنهادی",
    user: "شما",
    mentor: "منتور تک‌پی",
    thinking: "در حال بررسی سؤال و مسیر یادگیری…",
    researching: "در حال پژوهش عمومی و کنترل منابع…",
    sourceLessons: "درس‌های مرتبط",
    publicSources: "منابع عمومی",
    checklist: "چک‌لیست پیشنهادی",
    suggested: "ادامه پیشنهادی",
    inputLabel: "پیام شما به منتور",
    inputPlaceholder: "سؤال خود را بنویسید…",
    send: "ارسال سؤال",
    sending: "در حال ارسال",
    standardMode: "حالت آموزشی؛ پاسخ از داده‌های مجاز مسیر یادگیری استفاده می‌کند.",
    researchMode: "پژوهش عمومی؛ فقط متن همین سؤال خارج می‌شود و تاریخچه، پروفایل، ضعف‌ها و اطلاعات مالی ارسال نمی‌شوند.",
    privacy: "رمز، Seed Phrase، کد 2FA، کلید خصوصی یا اطلاعات هویتی را در چت وارد نکنید.",
    profileUnavailable: "داده شخصی‌سازی در دسترس نیست؛ منتور چیزی را حدس نمی‌زند.",
    completedTerms: "ترم تکمیل‌شده",
    confidence: "اعتماد آموزشی",
    currentSurface: "نمایشگر فعال",
    academy: "آکادمی",
    web_research: "پژوهش وب",
    social_research: "پژوهش سوشال/X",
    retryHistory: "تلاش دوباره",
    arena: "چالش Arena",
    arenaLabel: "بازکردن چالش تمرینی Arena",
    newsBrief: "مرور خبر",
    newsLabel: "آماده‌سازی مرور منبع‌دار خبر",
    newsPremium: "مرور خبر منبع‌دار در نسخه پرمیوم فعال است",
    newsPrompt: "مهم‌ترین اخبار امروز بازار رمزارز را فقط با منابع عمومی معتبر، زمان انتشار، سطح اطمینان و اثر احتمالی بر ریسک تمرین خلاصه کن؛ اگر داده تازه در دسترس نیست، صریح بگو.",
    errorLogin: "نشست شما منقضی شده است؛ برای ادامه دوباره وارد شوید.",
    errorLoginAction: "ورود دوباره",
    errorRateLimited: "تعداد درخواست‌ها زیاد بوده؛ چند لحظه دیگر دوباره امتحان کنید.",
    errorThreadGone: "این گفت‌وگو دیگر در دسترس نیست. یک گفت‌وگوی جدید شروع کنید.",
    errorNetwork: "ارتباط با سرور برقرار نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.",
    errorGeneric: "پاسخ زنده در دسترس نبود؛ پاسخ زیر راهنمای آموزشی از‌پیش‌آماده است، نه پاسخ زنده هوش مصنوعی.",
    errorDismiss: "متوجه شدم",
    liveAnswer: "پاسخ زنده هوش مصنوعی",
    preparedAnswer: "راهنمای آموزشی آماده",
    notSaved: "این گفت‌وگو ذخیره نشد",
  },
  en: {
    eyebrow: "Your personal workspace",
    title: "TecPey AI Mentor",
    subtitle: "A calm space to ask, learn and continue your conversations.",
    freePlan: "Core plan",
    premiumPlan: "Premium plan",
    safety: "Education and risk first",
    history: "Conversation history",
    historyDescription: "Pick up where you left off in a saved conversation.",
    office: "Mentor office",
    hideOffice: "Collapse mentor office",
    privacyLink: "Privacy",
    support: "Support",
    welcome: "One question. A clearer next step.",
    welcomeText: "Understand a concept, practise a decision and move forward with context. Choose a starting point or ask your own question.",
    draftHint: "Starting points prepare a draft. You decide when to send it.",
    learnTitle: "Make it make sense",
    learnText: "One concept, one example, one exercise",
    learnPrompt: "Explain the difference between holding crypto in a personal wallet and on an exchange with a simple example, then ask a question to check my understanding.",
    riskTitle: "Review a decision",
    riskText: "Understand risk before practising",
    riskPrompt: "Build an entry-thesis, invalidation and risk-management checklist for a hypothetical trade. Do not recommend buying or selling.",
    practiceTitle: "Put learning to work",
    practiceText: "An educational scenario, no real money",
    practicePrompt: "Create an educational FOMO scenario. Ask me to explain my decision first, then give feedback. Do not suggest a real trade.",
    modeLabel: "Conversation mode",
    historyUnavailable: "History is temporarily unavailable. The current chat can continue without claiming it was saved.",
    historyEmpty: "No saved conversations yet.",
    newConversation: "New conversation",
    closeHistory: "Close history",
    conversation: "Mentor conversation",
    emptyTitle: "I’m here. We’ll start from where you are.",
    emptyText: "Ask a learning, security or risk-management question. Select a Premium monitor for web or social research.",
    starterQuestions: "Suggested starting points",
    user: "You",
    mentor: "TecPey Mentor",
    thinking: "Reviewing your question and learning context…",
    researching: "Researching public sources and checking evidence…",
    sourceLessons: "Related lessons",
    publicSources: "Public sources",
    checklist: "Suggested checklist",
    suggested: "Suggested follow-up",
    inputLabel: "Your message to the mentor",
    inputPlaceholder: "Write your question…",
    send: "Send question",
    sending: "Sending",
    standardMode: "Learning mode uses only permitted learning-path context.",
    researchMode: "Public research sends only this query—not history, profile, weak areas, financial data or identity documents.",
    privacy: "Never enter passwords, seed phrases, 2FA codes, private keys or identity documents in chat.",
    profileUnavailable: "Personalization evidence is unavailable, so the mentor will not guess.",
    completedTerms: "completed terms",
    confidence: "Learning confidence",
    currentSurface: "Active monitor",
    academy: "Academy",
    web_research: "Web research",
    social_research: "Social/X research",
    retryHistory: "Try again",
    arena: "Arena challenge",
    arenaLabel: "Open a Trading Arena practice challenge",
    newsBrief: "News brief",
    newsLabel: "Prepare a source-backed news brief",
    newsPremium: "Source-backed news brief is available on Premium",
    newsPrompt: "Summarize today's most important crypto-market news using only credible public sources. Include publication time, confidence and possible implications for practice risk; say clearly when fresh data is unavailable.",
    errorLogin: "Your session has expired; sign in again to continue.",
    errorLoginAction: "Sign in again",
    errorRateLimited: "Too many requests. Please try again in a moment.",
    errorThreadGone: "This conversation is no longer available. Start a new one.",
    errorNetwork: "Could not reach the server. Check your connection and try again.",
    errorGeneric: "A live answer was not available; the reply below is prepared academy guidance, not a live AI answer.",
    errorDismiss: "Got it",
    liveAnswer: "Live AI answer",
    preparedAnswer: "Prepared academy guidance",
    notSaved: "This reply was not saved",
  },
} as const;

function safeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type DeepLinkParams = { term?: number; lesson?: number; q?: string };

/**
 * Reads ?term=/?lesson=/?q= once. Isolated in its own component so only this
 * leaf opts out of static rendering (useSearchParams requires a Suspense
 * boundary) rather than the whole workspace.
 */
function MentorDeepLinkParams({ onResolved }: { onResolved: (params: DeepLinkParams) => void }) {
  const searchParams = useSearchParams();
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const term = Number(searchParams.get("term"));
    const lesson = Number(searchParams.get("lesson"));
    const q = searchParams.get("q");
    onResolved({
      term: Number.isInteger(term) && term >= 1 && term <= 7 ? term : undefined,
      lesson: Number.isInteger(lesson) && lesson > 0 ? lesson : undefined,
      q: q || undefined,
    });
  }, [searchParams, onResolved]);
  return null;
}

export function AiMentorExperience({
  locale = "fa-IR",
  plan = "free",
}: AiMentorExperienceProps) {
  const mentorLocale: MentorLocale = locale.toLowerCase().startsWith("fa")
    ? "fa"
    : "en";
  const isFa = mentorLocale === "fa";
  const copy = mentorLocale === "fa" ? COPY.fa : COPY.en;
  const direction = mentorWorkspaceDirection(locale);
  const officialProgress = useAcademyPathProgress(mentorLocale);
  const { data: mentorInsights } = useMentorInsights({ enabled: true });

  const [serverPlan, setServerPlan] = useState<MentorWorkspacePlan>(plan);
  const [capabilityReady, setCapabilityReady] = useState(false);
  const effectivePlan: MentorWorkspacePlan = capabilityReady ? serverPlan : "free";
  const [selectedSurface, setSelectedSurface] = useState<MentorWorkspaceSurface>("academy");
  const activeSurface: MentorWorkspaceSurface = canUseMentorWorkspaceSurface(
    effectivePlan,
    selectedSurface,
  )
    ? selectedSurface
    : "academy";
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [threads, setThreads] = useState<MentorThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [officeExpanded, setOfficeExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [arenaPanel, setArenaPanel] = useState<MentorArenaPanelState>("closed");
  const [scenarioCue, setScenarioCue] = useState<"news" | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [lastAskedMode, setLastAskedMode] = useState<ReturnType<typeof detectMentorMode>>("concept");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const arenaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const historySheetRef = useRef<HTMLDialogElement | null>(null);
  const explainTimerRef = useRef<number | null>(null);
  const conversationEpochRef = useRef(0);
  const deepLinkContextRef = useRef<{ term?: number; lesson?: number } | null>(null);

  const handleDeepLinkParams = useCallback((params: { term?: number; lesson?: number; q?: string }) => {
    if (params.term || params.lesson) {
      deepLinkContextRef.current = { term: params.term, lesson: params.lesson };
    }
    if (params.q) {
      const prefill = params.q.slice(0, 900);
      setQuestion((current) => (current ? current : prefill));
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, []);

  const completedTerms = useMemo(
    () =>
      Object.values(officialProgress.termProgress).filter((item) => item.completed)
        .length,
    [officialProgress.termProgress],
  );
  const confidence = mentorInsights?.profile?.confidenceScore ?? null;
  const publicResearch =
    mentorResearchModeForSurface(effectivePlan, activeSurface) === "public";

  const dateFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    } catch {
      return new Intl.DateTimeFormat(mentorLocale, { day: "numeric", month: "short" });
    }
  }, [locale, mentorLocale]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mentor-preferences", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (controller.signal.aborted) return;
        const nextPlan: MentorWorkspacePlan =
          response.ok && data?.capabilities?.plan === "premium"
            ? "premium"
            : "free";
        setServerPlan(nextPlan);
        setCapabilityReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServerPlan("free");
          setCapabilityReady(true);
        }
      });
    return () => controller.abort();
  }, []);

  const applyThreadsPayload = useCallback((responseOk: boolean, data: unknown) => {
    const payload = data as { ok?: boolean; threads?: MentorThread[] } | null;
    if (!responseOk || !payload?.ok || !Array.isArray(payload.threads)) {
      setHistoryUnavailable(true);
      return;
    }
    const localized = payload.threads.filter(
      (thread) => thread.status === "active" && thread.locale === mentorLocale,
    );
    setThreads(localized);
    if (!localized.length) setMessages([]);
    setHistoryUnavailable(false);
    setActiveThreadId((current) => {
      if (current && localized.some((thread) => thread.id === current)) {
        return current;
      }
      return conversationEpochRef.current === 0
        ? localized[0]?.id ?? null
        : current;
    });
  }, [mentorLocale]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const response = await fetch("/api/mentor-threads", { cache: "no-store" });
      const data = await response.json();
      applyThreadsPayload(response.ok, data);
    } catch {
      setHistoryUnavailable(true);
    } finally {
      setThreadsLoading(false);
    }
  }, [applyThreadsPayload]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mentor-threads", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!controller.signal.aborted) applyThreadsPayload(response.ok, data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessages([]);
          setHistoryUnavailable(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setThreadsLoading(false);
      });
    return () => controller.abort();
  }, [applyThreadsPayload]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setHistoryLoading(true);
    });
    fetch(`/api/mentor-conversations?limit=50&threadId=${encodeURIComponent(activeThreadId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (controller.signal.aborted) return;
        if (!response.ok || !data?.ok || !Array.isArray(data.conversations)) {
          setMessages([]);
          setHistoryUnavailable(true);
          return;
        }
        const history = data.conversations
          .map((item: { id?: unknown; role?: unknown; content?: unknown; createdAt?: unknown }) => ({
            id: String(item.id ?? safeMessageId("history")),
            role: item.role === "assistant" ? "assistant" as const : "user" as const,
            content: String(item.content ?? ""),
            createdAt: String(item.createdAt ?? new Date().toISOString()),
          }))
          .filter((item: WorkspaceMessage) => item.content.trim().length > 0)
          .reverse();
        setMessages(history);
        setHistoryUnavailable(data.storage === "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [activeThreadId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [historyLoading, loading, messages]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    window.requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    const dialog = historySheetRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [historyOpen]);

  useEffect(
    () => () => {
      if (explainTimerRef.current) window.clearTimeout(explainTimerRef.current);
    },
    [],
  );

  const newConversation = useCallback(() => {
    conversationEpochRef.current += 1;
    setLoading(false);
    setIsExplaining(false);
    setHistoryLoading(false);
    setHistoryUnavailable(false);
    setRequestError(null);
    setActiveThreadId(null);
    setMessages([]);
    setQuestion("");
    closeHistory();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [closeHistory]);

  const selectThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) {
        closeHistory();
        return;
      }
      conversationEpochRef.current += 1;
      setLoading(false);
      setIsExplaining(false);
      setHistoryLoading(true);
      setHistoryUnavailable(false);
      setRequestError(null);
      setMessages([]);
      setActiveThreadId(threadId);
      closeHistory();
    },
    [activeThreadId, closeHistory],
  );

  const openArena = useCallback(() => {
    setScenarioCue(null);
    setArenaPanel("docked");
  }, []);

  const closeArena = useCallback(() => {
    setArenaPanel("closed");
    window.requestAnimationFrame(() => arenaTriggerRef.current?.focus());
  }, []);

  const selectSurface = useCallback(
    (surface: MentorWorkspaceSurface) => {
      if (!canUseMentorWorkspaceSurface(effectivePlan, surface)) return;
      setSelectedSurface(surface);
    },
    [effectivePlan],
  );

  const ask = useCallback(async () => {
    const clean = question.trim();
    if (clean.length < 2 || loading || historyLoading) return;
    const askedMode = detectMentorMode(clean);
    const requestConversationEpoch = conversationEpochRef.current;
    const userMessage: WorkspaceMessage = {
      id: safeMessageId("user"),
      role: "user",
      content: clean,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setScenarioCue(null);
    setLastAskedMode(askedMode);
    setLoading(true);
    setIsExplaining(false);

    const deepLinkContext = deepLinkContextRef.current;
    deepLinkContextRef.current = null;
    const local = toLocalReply(clean, mentorLocale);
    try {
      const response = await fetch("/api/ai-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          locale: mentorLocale,
          mentorMode: askedMode,
          threadId: activeThreadId,
          researchMode: publicResearch ? "public" : undefined,
          term: deepLinkContext?.term,
          lesson: deepLinkContext?.lesson,
        }),
      });
      const data = (await response.json()) as Partial<MentorReply> & { error?: string };
      if (conversationEpochRef.current === requestConversationEpoch) {
        setRequestError(response.ok ? null : typeof data.error === "string" ? data.error : `http_${response.status}`);
      }
      const nextReply: MentorReply =
        response.ok && typeof data.answer === "string"
          ? { ...local, ...data, answer: data.answer }
          : local;
      if (conversationEpochRef.current !== requestConversationEpoch) {
        void loadThreads();
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: safeMessageId("mentor"),
          role: "assistant",
          content: nextReply.answer,
          createdAt: new Date().toISOString(),
          reply: nextReply,
        },
      ]);
      if (nextReply.threadId) setActiveThreadId(nextReply.threadId);
      setIsExplaining(true);
      if (explainTimerRef.current) window.clearTimeout(explainTimerRef.current);
      explainTimerRef.current = window.setTimeout(() => setIsExplaining(false), 1_200);
      void loadThreads();
    } catch {
      if (conversationEpochRef.current === requestConversationEpoch) {
        setRequestError("network_error");
        setMessages((current) => [
          ...current,
          {
            id: safeMessageId("mentor-fallback"),
            role: "assistant",
            content: local.answer,
            createdAt: new Date().toISOString(),
            reply: local,
          },
        ]);
        setIsExplaining(true);
        if (explainTimerRef.current) window.clearTimeout(explainTimerRef.current);
        explainTimerRef.current = window.setTimeout(
          () => setIsExplaining(false),
          1_200,
        );
      }
    } finally {
      if (conversationEpochRef.current === requestConversationEpoch) {
        setLoading(false);
      }
    }
  }, [
    activeThreadId,
    historyLoading,
    loadThreads,
    loading,
    mentorLocale,
    publicResearch,
    question,
  ]);

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void ask();
  };

  const errorNotice = (() => {
    if (!requestError) return null;
    if (requestError === "academy_login_required") {
      return { message: copy.errorLogin, action: "login" as const };
    }
    if (requestError === "rate_limited") {
      return { message: copy.errorRateLimited, action: "dismiss" as const };
    }
    if (requestError === "mentor_thread_not_found" || requestError === "invalid_mentor_thread") {
      return { message: copy.errorThreadGone, action: "new" as const };
    }
    if (requestError === "network_error") {
      return { message: copy.errorNetwork, action: "dismiss" as const };
    }
    return { message: copy.errorGeneric, action: "dismiss" as const };
  })();

  const stageEvent = mentorStageEventForWorkspaceActivity({
    arenaPanel,
    composing: question.trim().length > 0,
    engaged: messages.length > 0,
    newsBriefRequested: scenarioCue === "news",
    researching: publicResearch,
    riskReviewRequested: lastAskedMode === "risk",
    speaking: isExplaining,
    thinking: loading,
  });
  const stageDirection = directMentorStage({
    event: stageEvent,
    currentArenaPanel: arenaPanel,
    reducedMotion: prefersReducedMotion,
  });
  const mentorAct = stageDirection.act;
  const prepareDraft = (prompt: string) => {
    if (loading || historyLoading) return;
    setSelectedSurface("academy");
    setScenarioCue(null);
    setQuestion(prompt);
    textareaRef.current?.focus();
  };
  const startingPoints = [
    { title: copy.learnTitle, detail: copy.learnText, prompt: copy.learnPrompt, Icon: BookOpenCheck },
    { title: copy.riskTitle, detail: copy.riskText, prompt: copy.riskPrompt, Icon: ShieldCheck },
    { title: copy.practiceTitle, detail: copy.practiceText, prompt: copy.practicePrompt, Icon: BrainCircuit },
  ];
  const renderThreadList = () => (
    <div className={styles.threadList}>
      <button type="button" className={styles.newThreadButton} onClick={newConversation}>
        <MessageSquarePlus aria-hidden="true" />
        <span>{copy.newConversation}</span>
      </button>
      {threadsLoading ? (
        <div className={styles.threadState}>
          <Loader2 className={styles.spinner} aria-hidden="true" />
        </div>
      ) : threads.length ? (
        threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={styles.threadButton}
            data-active={thread.id === activeThreadId}
            aria-pressed={thread.id === activeThreadId}
            onClick={() => selectThread(thread.id)}
          >
            <MessageCircle aria-hidden="true" />
            <span>
              <strong><bdi>{thread.title}</bdi></strong>
              <small>{Number.isFinite(Date.parse(thread.lastMessageAt)) ? dateFormatter.format(new Date(thread.lastMessageAt)) : "—"}</small>
            </span>
          </button>
        ))
      ) : (
        <p className={styles.threadEmpty}>{copy.historyEmpty}</p>
      )}
      {historyUnavailable ? (
        <div className={styles.historyWarning} role="status">
          <WifiOff aria-hidden="true" />
          <p>{copy.historyUnavailable}</p>
          <button type="button" onClick={() => void loadThreads()}>
            {copy.retryHistory}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      className={styles.workspace}
      dir={direction}
      data-plan={effectivePlan}
      data-arena-panel={arenaPanel}
      aria-labelledby="mentor-workspace-title"
    >
      <Suspense fallback={null}>
        <MentorDeepLinkParams onResolved={handleDeepLinkParams} />
      </Suspense>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceIdentity}>
          <LivingMentorAvatar act={mentorAct} locale={locale} size="header" />
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="mentor-workspace-title">{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>
        <div className={styles.workspaceMeta}>
          <span data-plan={effectivePlan}>
            {effectivePlan === "premium" ? <Crown aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            {effectivePlan === "premium" ? copy.premiumPlan : copy.freePlan}
          </span>
          <Link href={isFa ? "/academy/account#pro" : "/en/academy/account#pro"} className={styles.planLink}><Crown aria-hidden="true" />Pro</Link>
        </div>
      </header>

      <div className={styles.mobilePresence}>
        <LivingMentorAvatar act={mentorAct} locale={locale} size="header" />
        <span><strong>{copy.mentor}</strong><small>{loading ? copy.thinking : copy.safety}</small></span>
        <button type="button" aria-expanded={officeExpanded} aria-controls="mentor-office" onClick={() => setOfficeExpanded((open) => !open)}>
          {officeExpanded ? copy.hideOffice : copy.office}<ChevronDown aria-hidden="true" />
        </button>
      </div>
      <div className={styles.workspaceGrid} data-arena-panel={arenaPanel} data-office-expanded={officeExpanded}>
        <div className={styles.officeCell} id="mentor-office">
          <MentorOfficeScene
            activeSurface={activeSurface}
            completedTerms={completedTerms}
            confidence={confidence}
            framing={stageDirection.framing}
            gaze={stageDirection.gaze}
            intensity={stageDirection.intensity}
            locale={locale}
            mentorAct={mentorAct}
            mode={stageDirection.mode}
            motion={stageDirection.motion}
            onSelectSurface={selectSurface}
            plan={effectivePlan}
            pose={stageDirection.pose}
            status={
              loading
                ? publicResearch
                  ? "researching"
                  : "thinking"
                : isExplaining
                  ? "explaining"
                  : question.trim().length > 0
                    ? "listening"
                    : "idle"
            }
          />
        </div>
        <section className={styles.chatPanel} dir={direction} aria-label={copy.conversation}>
          <header className={styles.chatHeader}>
            <div>
              <p>{copy.conversation}</p>
              <div className={styles.chatEvidence}>
                <span><BookOpenCheck aria-hidden="true" />{completedTerms}/7 {copy.completedTerms}</span>
                <span><BrainCircuit aria-hidden="true" />{copy.confidence}: {confidence === null ? "—" : `${Math.round(confidence)}%`}</span>
              </div>
            </div>
            <div className={styles.chatHeaderActions}>
              <button
                ref={arenaTriggerRef}
                type="button"
                className={styles.scenarioAction}
                onClick={openArena}
                aria-label={copy.arenaLabel}
                aria-expanded={arenaPanel !== "closed"}
              >
                <ChartNoAxesCombined aria-hidden="true" />
                <span>{copy.arena}</span>
              </button>
              <button
                ref={historyTriggerRef}
                type="button"
                className={styles.historyTrigger}
                onClick={() => setHistoryOpen(true)}
                aria-label={copy.history}
                aria-haspopup="dialog"
                aria-expanded={historyOpen}
                aria-controls="mentor-history-dialog"
              >
                <History aria-hidden="true" />
                <span>{copy.history}</span>
              </button>
              <button type="button" className={styles.compactNewThread} onClick={newConversation} aria-label={copy.newConversation}>
                <MessageSquarePlus aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className={styles.chatBody}>

            <div className={styles.conversation} dir={direction}>
              <div
                className={styles.messages}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {historyLoading ? (
                  <div className={styles.conversationLoading}>
                    <Loader2 className={styles.spinner} aria-hidden="true" />
                  </div>
                ) : messages.length ? (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={styles.message}
                      data-role={message.role}
                    >
                      <div className={styles.messageAuthor}>
                        {message.role === "assistant" ? (
                          <LivingMentorAvatar act="explain" decorative locale={locale} size="launcher" />
                        ) : (
                          <span className={styles.userMark} aria-hidden="true">TP</span>
                        )}
                        <strong>{message.role === "assistant" ? copy.mentor : copy.user}</strong>
                      </div>
                      <p className={styles.messageText}>{message.content}</p>

                      {message.role === "assistant" && message.reply ? (
                        <span
                          className={styles.answerBadge}
                          data-source={message.reply.externalProviderUsed ? "live" : "prepared"}
                        >
                          {message.reply.externalProviderUsed ? copy.liveAnswer : copy.preparedAnswer}
                          {message.reply.memoryMode === "ephemeral" ? ` · ${copy.notSaved}` : ""}
                        </span>
                      ) : null}

                      {message.reply?.checklist?.length ? (
                        <div className={styles.replyBlock}>
                          <strong><CheckCircle2 aria-hidden="true" />{copy.checklist}</strong>
                          <ul>
                            {message.reply.checklist.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      {message.reply?.sourceLessons?.length ? (
                        <div className={styles.replyLinks}>
                          <strong>{copy.sourceLessons}</strong>
                          <div>
                            {message.reply.sourceLessons.slice(0, 4).map((source) => (
                              <Link key={source.href} href={source.href}>
                                <BookOpenCheck aria-hidden="true" />{source.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.reply?.sources?.length ? (
                        <div className={styles.replyLinks}>
                          <strong>{copy.publicSources}</strong>
                          <div>
                            {message.reply.sources.slice(0, 6).map((source, index) => (
                              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink aria-hidden="true" />
                                {source.title || `${copy.publicSources} ${index + 1}`}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </article>
                  ))
                ) : (
                  <div className={styles.emptyConversation}>
                    <span className={styles.welcomeMark} aria-hidden="true"><BookOpenCheck /></span>
                    <h2>{copy.welcome}</h2>
                    <p>{copy.welcomeText}</p>
                    <div className={styles.startingPoints} aria-label={copy.starterQuestions}>
                      {startingPoints.map(({ title, detail, prompt, Icon }) => (
                        <button key={title} type="button" onClick={() => prepareDraft(prompt)} disabled={loading || historyLoading}>
                          <Icon aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                    <p className={styles.draftHint}>{copy.draftHint}</p>
                  </div>
                )}

                {loading ? (
                  <div className={styles.mentorLoading} role="status">
                    <LivingMentorAvatar act="think" decorative locale={locale} size="launcher" />
                    <Loader2 className={styles.spinner} aria-hidden="true" />
                    <span>{publicResearch ? copy.researching : copy.thinking}</span>
                  </div>
                ) : null}
                <div ref={messageEndRef} />
              </div>

              {errorNotice ? (
                <div className={styles.requestError} role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <p>{errorNotice.message}</p>
                  <div>
                    {errorNotice.action === "login" ? (
                      <Link href={isFa ? "/academy" : "/en/academy"}>{copy.errorLoginAction}</Link>
                    ) : null}
                    {errorNotice.action === "new" ? (
                      <button type="button" onClick={newConversation}>{copy.newConversation}</button>
                    ) : null}
                    <button type="button" onClick={() => setRequestError(null)}>{copy.errorDismiss}</button>
                  </div>
                </div>
              ) : null}

              <div className={styles.composer} id="mentor-chat">
                <div className={styles.composerHeading}>
                  <label htmlFor="mentor-workspace-question">{copy.inputLabel}</label>
                  <span aria-label={copy.modeLabel}>{copy[activeSurface]}</span>
                </div>
                {publicResearch ? <p className={styles.researchNotice}>{copy.researchMode}</p> : null}
                <div className={styles.composerInput}>
                  <textarea
                    id="mentor-workspace-question"
                    ref={textareaRef}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value.slice(0, 900))}
                    onKeyDown={onComposerKeyDown}
                    rows={3}
                    maxLength={900}
                    dir="auto"
                    placeholder={copy.inputPlaceholder}
                    disabled={loading || historyLoading}
                  />
                  <div className={styles.composerControls}>
                    <span>{question.length}/900</span>
                    <button
                      type="button"
                      onClick={() => void ask()}
                      disabled={loading || historyLoading || question.trim().length < 2}
                      aria-label={loading ? copy.sending : copy.send}
                    >
                      {loading ? <Loader2 className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}
                      <span>{loading ? copy.sending : copy.send}</span>
                    </button>
                  </div>
                </div>
                <div className={styles.composerFooter}>
                  <p className={styles.privacyNote}><ShieldCheck aria-hidden="true" />{copy.privacy}</p>
                  <nav aria-label={copy.privacyLink}>
                    <Link href={isFa ? "/academy/account#mentor-privacy" : "/en/academy/account#mentor-privacy"}>{copy.privacyLink}</Link>
                    <Link href={isFa ? "/support" : "/en/support"}>{copy.support}</Link>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </section>

        {arenaPanel !== "closed" ? (
          <div className={styles.arenaCell}>
            <MentorArenaDock
              locale={locale}
              onClose={closeArena}
              onDock={() => setArenaPanel("docked")}
              onFocus={() => setArenaPanel("focus")}
              onMinimize={() => setArenaPanel("minimized")}
              panel={arenaPanel}
              plan={effectivePlan}
            />
          </div>
        ) : null}
      </div>

      {historyOpen ? (
          <dialog
            ref={historySheetRef}
            id="mentor-history-dialog"
            className={styles.historyDialog}
            onCancel={(event) => { event.preventDefault(); closeHistory(); }}
            aria-labelledby="mentor-history-title"
            dir={direction}
          >
            <header>
              <div>
                <History aria-hidden="true" />
                <span>
                  <strong id="mentor-history-title">{copy.history}</strong>
                  <small>{copy.historyDescription}</small>
                </span>
              </div>
              <button type="button" onClick={closeHistory} aria-label={copy.closeHistory}>
                <X aria-hidden="true" />
              </button>
            </header>
            {renderThreadList()}
          </dialog>
      ) : null}
    </section>
  );
}
