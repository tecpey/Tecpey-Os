"use client";

import Link from "next/link";
import {
  BookOpenCheck,
  BrainCircuit,
  ChartNoAxesCombined,
  CheckCircle2,
  Crown,
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MentorArenaDock } from "@/components/mentor/MentorArenaDock";
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
    historyDescription: "تاریخچه از رکورد امن سمت سرور خوانده می‌شود.",
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
  },
  en: {
    eyebrow: "Your personal workspace",
    title: "TecPey AI Mentor",
    subtitle: "A calm space to ask, learn and continue your conversations.",
    freePlan: "Core plan",
    premiumPlan: "Premium plan",
    safety: "Education and risk first",
    history: "Conversation history",
    historyDescription: "History is read from authenticated server records.",
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
  },
} as const;

function safeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const activeSurface: MentorWorkspaceSurface = "academy";
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [threads, setThreads] = useState<MentorThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [arenaPanel, setArenaPanel] = useState<MentorArenaPanelState>("closed");
  const [scenarioCue, setScenarioCue] = useState<"news" | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [lastAskedMode, setLastAskedMode] = useState<ReturnType<typeof detectMentorMode>>("concept");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const arenaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const historySheetRef = useRef<HTMLDivElement | null>(null);
  const explainTimerRef = useRef<number | null>(null);
  const conversationEpochRef = useRef(0);

  const completedTerms = useMemo(
    () =>
      Object.values(officialProgress.termProgress).filter((item) => item.completed)
        .length,
    [officialProgress.termProgress],
  );
  const confidence = mentorInsights?.profile?.confidenceScore ?? null;
  const publicResearch =
    mentorResearchModeForSurface(plan, activeSurface) === "public";

  const dateFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    } catch {
      return new Intl.DateTimeFormat(mentorLocale, { day: "numeric", month: "short" });
    }
  }, [locale, mentorLocale]);

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = historySheetRef.current;
    const focusable = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistory();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeHistory, historyOpen]);

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
        }),
      });
      const data = (await response.json()) as Partial<MentorReply>;
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
              <strong>{thread.title}</strong>
              <small>{dateFormatter.format(new Date(thread.lastMessageAt))}</small>
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
      data-plan={plan}
      data-arena-panel={arenaPanel}
      aria-labelledby="mentor-workspace-title"
    >
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
          <span data-plan={plan}>
            {plan === "premium" ? <Crown aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            {plan === "premium" ? copy.premiumPlan : copy.freePlan}
          </span>
          <Link href={isFa ? "/academy/account#pro" : "/en/academy/account#pro"} className={styles.planLink}><Crown aria-hidden="true" />Pro</Link>
        </div>
      </header>

      <div className={`${styles.workspaceGrid} ${styles.conversationWorkspace}`} data-arena-panel={arenaPanel}>
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
            <aside className={styles.historyRail} dir={direction} aria-label={copy.history}>
              <div className={styles.historyRailHeader}>
                <History aria-hidden="true" />
                <div>
                  <strong>{copy.history}</strong>
                  <p>{copy.historyDescription}</p>
                </div>
              </div>
              {renderThreadList()}
            </aside>

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
                    <h2>{isFa ? "امروز چه چیزی را با هم یاد بگیریم؟" : "What would you like to explore?"}</h2>
                    <p>{isFa ? "دربارهٔ درس‌ها و تمرین‌هایت بپرس. گفت‌وگوهای ذخیره‌شده را از تاریخچه ادامه بده." : "Ask about your lessons and practice. Continue saved conversations from your history."}</p>
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

              <div className={styles.composer}>
                <label htmlFor="mentor-workspace-question">{copy.inputLabel}</label>
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
                <p className={styles.privacyNote}><ShieldCheck aria-hidden="true" />{copy.privacy}</p>
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
              plan={plan}
            />
          </div>
        ) : null}
      </div>

      {historyOpen ? (
        <div className={styles.historyOverlay} data-direction={direction}>
          <button type="button" className={styles.historyBackdrop} onClick={closeHistory} aria-label={copy.closeHistory} />
          <div
            ref={historySheetRef}
            className={styles.historySheet}
            role="dialog"
            aria-modal="true"
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
          </div>
        </div>
      ) : null}
    </section>
  );
}
