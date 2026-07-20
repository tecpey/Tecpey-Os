import { NextRequest } from "next/server";
import { academyPathTerms } from "@/data/academyPath";
import { caseStudiesForTerm } from "@/data/academyCaseStudies";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  buildContextPrompt,
  getMentorContext,
  getOrCreateMentorProfile,
  saveMentorConversation,
} from "@/lib/mentor-memory";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { computeBehavioralSnapshot } from "@/lib/behavioral-engine";
import { buildBehavioralPrompt, collectBehavioralInputs } from "@/lib/behavioral-context-server";

type MentorRequest = {
  question?: string;
  locale?: "fa" | "en" | string;
  term?: number | string;
  lesson?: number | string;
  history?: { role?: string; content?: string }[];
  progress?: { completedTerms?: number[]; weakAreas?: string[]; confidence?: number; riskProfile?: string; goal?: string; level?: string };
  mentorMode?: string;
};

const MAX_QUESTION_LENGTH = 900;
const MAX_HISTORY_ITEMS = 6;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function clean(value: unknown, max = 900) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function containsSensitiveSecret(text: string) {
  return /(seed phrase|private key|mnemonic|عبارت بازیابی|کلید خصوصی|رمز عبور|پسورد|کد 2fa|کد دو مرحله|api key|secret key|sk-proj-|sk-)/i.test(text);
}

function detectTerm(question: string, requestedTerm?: number) {
  if (requestedTerm && requestedTerm >= 1 && requestedTerm <= 7) return requestedTerm;
  const q = question.toLowerCase();
  if (/seed|phrase|2fa|phishing|wallet|کیف پول|فیشینگ|امنیت|عبارت بازیابی|هک|پسورد|رمز/.test(q)) return 2;
  if (/market order|limit|stop|oco|slippage|spread|اسلیپیج|سفارش|معامله|خرید|فروش|برداشت/.test(q)) return 3;
  if (/fdv|market cap|توکنومیکس|tokenomics|whitepaper|vesting|tvl|وایت|پروژه|تیم|نقدشوندگی|کلاهبرداری/.test(q)) return 4;
  if (/rsi|macd|کندل|حمایت|مقاومت|volume|trend|روند|اندیکاتور|نمودار|واگرایی/.test(q)) return 5;
  if (/risk|position|drawdown|stop loss|ریسک|حد ضرر|سرمایه|سبد|dca|ضرر|سایز/.test(q)) return 6;
  if (/fomo|fear|greed|revenge|psychology|ترس|طمع|انتقامی|هیجان|روانشناسی|ژورنال/.test(q)) return 7;
  return 1;
}

function termKnowledge(termNumber: number, lessonNumber?: number) {
  const term = academyPathTerms.find((item) => item.number === termNumber) || academyPathTerms[0];
  const selectedCaseStudies = caseStudiesForTerm(termNumber);
  const selectedLessons = lessonNumber && term.lessons[lessonNumber - 1]
    ? [term.lessons[lessonNumber - 1]]
    : term.lessons.slice(0, 6);

  const lessons = selectedLessons
    .map((lesson, index) => {
      const [title, concept, example, mistake, checklist, proTip] = lesson;
      return [
        `درس ${lessonNumber || index + 1}: ${title}`,
        `مفهوم: ${concept}`,
        `مثال: ${example}`,
        `اشتباه رایج: ${mistake}`,
        `چک‌لیست: ${checklist}`,
        `نکته حرفه‌ای: ${proTip}`,
      ].join("\n");
    })
    .join("\n\n");

  return {
    term,
    text: [
      `ترم: ${term.title}`,
      `سطح: ${term.level}`,
      `هدف: ${term.outcome}`,
      `معیار آمادگی: ${term.readiness.join(" | ")}`,
      lessons,
      selectedCaseStudies.length ? `پرونده‌های عملی این ترم:\n${selectedCaseStudies.map((item) => `- ${item.title}: ${item.summary} | تمرین: ${item.learnerTask}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n"),
    sourceLessons: selectedLessons.map((lesson, index) => ({
      title: lesson[0],
      href: `/academy/${term.slug}#lesson-${lessonNumber || index + 1}`,
    })),
  };
}

function suggestedQuestions(termNumber: number) {
  const bank: Record<number, string[]> = {
    1: ["فرق قیمت پایین و ارزش بازار چیست؟", "چرا بیت‌کوین کمیاب است اما سود تضمینی ندارد؟"],
    2: ["Seed Phrase را امن کجا نگه دارم؟", "چطور لینک فیشینگ را تشخیص بدهم؟"],
    3: ["Market Order چه زمانی خطرناک می‌شود؟", "قبل از برداشت تتر چه چیزهایی را چک کنم؟"],
    4: ["FDV و Vesting چه ریسکی دارند؟", "چطور Red Flag یک پروژه را پیدا کنم؟"],
    5: ["RSI بالا همیشه یعنی فروش؟", "حمایت و مقاومت را چطور با ریسک ترکیب کنم؟"],
    6: ["با سرمایه فرضی چطور اندازه موقعیت را حساب کنم؟", "Drawdown را چطور کنترل کنم؟"],
    7: ["وقتی FOMO دارم چه کنم؟", "ژورنال معاملاتی چه چیزهایی باید داشته باشد؟"],
  };
  return bank[termNumber] || bank[1];
}

function localFallback(question: string, termNumber: number, lessonNumber?: number) {
  const knowledge = termKnowledge(termNumber, lessonNumber);
  const q = question.toLowerCase();
  const secretWarning = containsSensitiveSecret(question)
    ? "\n\nهشدار امنیتی: هیچ‌وقت Seed Phrase، کلید خصوصی، رمز عبور، کد 2FA یا API Key را برای هیچ فرد، ربات یا پشتیبانی ارسال نکن. اگر چنین اطلاعاتی را جایی فرستاده‌ای، آن را افشا شده فرض کن و مسیر امن‌سازی را شروع کن."
    : "";

  let focus = "اول مفهوم را از تصمیم مالی جدا کن. پاسخ آموزشی تک‌پی جایگزین تحقیق شخصی یا توصیه خرید و فروش نیست؛ هدف این است که قبل از اقدام، سؤال درست‌تری بپرسی.";
  if (/rsi|macd|کندل|حمایت|مقاومت|نمودار/.test(q)) focus = "تحلیل تکنیکال ابزار احتمالات است، نه دستور خرید یا فروش. RSI، MACD، حمایت و مقاومت فقط وقتی ارزش دارند که کنار روند، حجم، نقطه ابطال و مدیریت ریسک دیده شوند.";
  if (/seed|phrase|کیف پول|فیشینگ|امنیت|هک/.test(q)) focus = "در امنیت رمزارز، بعضی خطاها برگشت‌پذیر نیستند. اطلاعات محرمانه را آنلاین ذخیره نکن، دامنه رسمی را بررسی کن، 2FA را فعال کن و قبل از هر انتقال شبکه و آدرس را دوباره چک کن.";
  if (/risk|ریسک|سرمایه|حد ضرر|position|ضرر/.test(q)) focus = "قبل از فکر کردن به سود، باید بدانی اگر اشتباه کنی چقدر از کل سرمایه آسیب می‌بیند. اندازه موقعیت، حد ضرر و قانون توقف باید قبل از ورود مشخص باشد.";
  if (/fdv|market cap|توکنومیکس|پروژه|vesting|whitepaper/.test(q)) focus = "برای بررسی پروژه فقط قیمت یا تبلیغ کافی نیست. کاربرد واقعی، تیم، وایت‌پیپر، توکنومیکس، FDV، Vesting، نقدشوندگی و Red Flagها را کنار هم ببین.";

  return {
    answer: `${focus}${secretWarning}\n\nدرس مرتبط: ${knowledge.term.title}\n\nقدم بعدی: یک مثال واقعی از سؤال خودت بنویس و از خودت بپرس اگر تحلیل من اشتباه باشد، چه چیزی از دست می‌دهم؟`,
    mode: "fallback",
    relatedTerm: { number: knowledge.term.number, title: knowledge.term.title, href: `/academy/${knowledge.term.slug}` },
    sourceLessons: knowledge.sourceLessons,
    suggestedQuestions: suggestedQuestions(knowledge.term.number),
    checklist: [
      "مفهوم را با زبان ساده برای خودت توضیح بده.",
      "ریسک اصلی و اشتباه رایج را بنویس.",
      "قبل از هر تصمیم، سناریوی اشتباه بودن تحلیل را مشخص کن.",
      "اگر سؤال مالی شخصی داری، آن را به چک‌لیست مدیریت ریسک تبدیل کن؛ نه دستور خرید یا فروش.",
    ],
  };
}

function extractOutputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const pieces: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) if (typeof content?.text === "string") pieces.push(content.text);
  }
  return pieces.join("\n").trim();
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/ai-mentor" }, async () => {
  if (!verifyCsrfOrigin(request))
    return apiError("forbidden", 403);

  const session = await getCanonicalSession(request, { strictRevocation: true });
  if (!session.isAcademyUser && !session.studentId) {
    return apiError("academy_login_required", 401);
  }

  const limit = await rateLimit(request, { namespace: "ai-mentor", limit: MAX_REQUESTS_PER_WINDOW, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return apiRateLimited(limit.retryAfterSeconds);
  }

  // studentId drives all memory operations; may be null for academy-auth-only sessions.
  const studentId = session.studentId;

  try {
    const raw = await request.text();
    if (raw.length > 6000) return apiError("payload_too_large", 413);

    const body = JSON.parse(raw) as MentorRequest;
    const question = clean(body.question, MAX_QUESTION_LENGTH);
    if (question.length < 2) return apiError("empty_question", 400);

    const requestedTerm = Number(body.term || 0);
    const requestedLesson = Number(body.lesson || 0);
    const termNumber = detectTerm(question, Number.isFinite(requestedTerm) ? requestedTerm : undefined);
    const lessonNumber = Number.isFinite(requestedLesson) && requestedLesson > 0 ? requestedLesson : undefined;
    const locale = clean(body.locale || "fa", 8) || "fa";
    const _progress = body.progress || {};
    const mentorMode = clean(body.mentorMode || "", 40);
    const knowledge = termKnowledge(termNumber, lessonNumber);
    const fallback = localFallback(question, termNumber, lessonNumber);

    // ── Load server-side mentor context (fire-and-forget if unavailable) ────
    const [mentorCtx, behavioralInputs] = await Promise.all([
      studentId ? getMentorContext(studentId) : Promise.resolve(null),
      studentId ? collectBehavioralInputs(studentId, locale === "en" ? "en" : "fa") : Promise.resolve(null),
      studentId ? getOrCreateMentorProfile(studentId) : Promise.resolve(null),
    ]);
    const behavioralSnapshot = behavioralInputs
      ? computeBehavioralSnapshot(behavioralInputs)
      : null;

    // Persist the user's question (non-blocking — failure logged internally).
    if (studentId) {
      void saveMentorConversation(studentId, "user", question, locale, termNumber);
    }

    const normalizedQuestion = question.toLowerCase();
    const lowCostPatterns = [
      /seed phrase|عبارت بازیابی|کلید خصوصی|private key/,
      /فرق .*market cap|ارزش بازار|قیمت پایین/,
      /حد ضرر|stop loss|position size|اندازه موقعیت/,
      /fomo|ترس|طمع|هیجان/,
    ];
    if (process.env.AI_MENTOR_COST_GUARD !== "off" && lowCostPatterns.some((pattern) => pattern.test(normalizedQuestion))) {
      if (studentId) void saveMentorConversation(studentId, "assistant", fallback.answer, locale, termNumber);
      return apiOk({ ...fallback, mentorStatus: "guided_from_academy", source: "academy_knowledge", rateLimit: { remaining: limit.remaining } });
    }

    const apiKey = [
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_PROJECT_API_KEY,
      process.env.CHATGPT_API_KEY,
    ].find((value) => value && !value.includes("REPLACE_WITH") && value.trim().startsWith("sk-"))?.trim();

    if (!apiKey) {
      if (studentId) void saveMentorConversation(studentId, "assistant", fallback.answer, locale, termNumber);
      return apiOk({ ...fallback, mentorStatus: "available" });
    }

    // Client-sent history is kept as a lightweight UI fallback while the DB
    // history is not yet fully populated (e.g. first session after migration).
    // TODO(mentor-memory): once mentor_conversations has been live for 30+ days,
    //   drop client-sent history entirely and rely solely on server context.
    const clientHistory = Array.isArray(body.history)
      ? body.history.slice(-MAX_HISTORY_ITEMS).map((item) => `${clean(item.role, 20)}: ${clean(item.content, 600)}`).join("\n")
      : "";

    // Build server-side context block from DB memories and progress.
    const contextBlock = mentorCtx ? buildContextPrompt(mentorCtx) : "";
    const behavioralBlock = behavioralSnapshot ? buildBehavioralPrompt(behavioralSnapshot) : "";

    const instructions = [
      `تو TecPey AI Mentor هستی؛ مربی آموزشی آکادمی تک‌پی.`,
      `\nقوانین غیرقابل نقض:`,
      `- توصیه مالی شخصی، سیگنال خرید/فروش، پیش‌بینی قطعی قیمت یا وعده سود نده.`,
      `- از کاربر Seed Phrase، کلید خصوصی، رمز عبور، کد 2FA، API Key یا اطلاعات محرمانه نخواه. اگر کاربر چنین چیزی فرستاد، هشدار امنیتی بده.`,
      `- پاسخ باید آموزشی، آرام، مرحله‌ای، کاربردی و متناسب با سطح کاربر، ترم‌های تکمیل‌شده و ضعف‌های ثبت‌شده باشد.`,
      `- فقط از دانش آکادمی تک‌پی و اصول عمومی مدیریت ریسک استفاده کن. اگر سؤال خارج از محدوده است، مرز پاسخ را روشن کن.`,
      `- در پایان پاسخ، یک چک‌لیست کوتاه، یک درس مرتبط و یک قدم بعدی شخصی‌سازی‌شده پیشنهاد کن.`,
      `- اگر سؤال درباره مقدار خرید یا فروش بود، آن را به مدیریت ریسک، اندازه موقعیت، سناریو و تحقیق شخصی تبدیل کن.`,
      `- زبان پاسخ را با زبان سؤال هماهنگ کن.`,
      contextBlock ? `\nاطلاعات شخصی‌سازی‌شده کاربر (از پایگاه داده):\n${contextBlock}` : "",
      behavioralBlock ? `\nنمای رفتاری محاسبه‌شده روی سرور:\n${behavioralBlock}` : "",
      `\nفرمت پاسخ:\n۱) پاسخ کوتاه و روشن\n۲) توضیح آموزشی با مثال\n۳) اشتباه رایج\n۴) چک‌لیست عملی\n۵) درس مرتبط`,
    ].filter(Boolean).join("\n");

    const input = [
      `سؤال کاربر:\n${question}`,
      `ترم و درس مرتبط از آکادمی تک‌پی:\n${knowledge.text}`,
      clientHistory ? `تاریخچه ارسال‌شده از کلاینت:\n${clientHistory}` : "بدون تاریخچه کلاینت",
      `زبان رابط: ${locale}`,
      mentorMode ? `حالت منتور: ${mentorMode}` : "",
    ].filter(Boolean).join("\n\n");

    const primaryModel = (process.env.AI_MENTOR_MODEL || "gpt-4o-mini").trim();
    const fallbackModel = (process.env.AI_MENTOR_FALLBACK_MODEL || "gpt-4.1-mini").trim();
    const maxOutputTokens = Math.max(250, Math.min(1200, Number(process.env.AI_MENTOR_MAX_OUTPUT_TOKENS || 700)));
    const temperature = Math.max(0, Math.min(0.7, Number(process.env.AI_MENTOR_TEMPERATURE || 0.2)));

    const callMentorModel = (model: string) => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input,
        temperature,
        max_output_tokens: maxOutputTokens,
      }),
    });

    let response = await callMentorModel(primaryModel);
    if (!response.ok && fallbackModel && fallbackModel !== primaryModel && (response.status === 400 || response.status === 404)) {
      response = await callMentorModel(fallbackModel);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (studentId) void saveMentorConversation(studentId, "assistant", fallback.answer, locale, termNumber);
      return apiOk({ ...fallback, mentorStatus: "safe_guidance", ...(process.env.NODE_ENV === "development" ? { aiError: `openai_${response.status}`, debug: errorText.slice(0, 240) } : {}), rateLimit: { remaining: limit.remaining } });
    }

    const data = await response.json();
    const answer = extractOutputText(data) || fallback.answer;

    // Persist the assistant's answer and trigger a non-blocking profile update.
    if (studentId) {
      void saveMentorConversation(studentId, "assistant", answer, locale, termNumber);
      scheduleMentorProfileUpdate(studentId, "mentor_conversation_saved");
    }

    return apiOk({ mentorStatus: "active", answer, relatedTerm: fallback.relatedTerm, sourceLessons: knowledge.sourceLessons, suggestedQuestions: suggestedQuestions(knowledge.term.number), checklist: fallback.checklist, rateLimit: { remaining: limit.remaining } });
  } catch {
    const fallback = localFallback("سؤال آموزشی", 1);
    return apiOk({ mentorStatus: "safe_guidance", answer: fallback.answer, relatedTerm: fallback.relatedTerm, sourceLessons: fallback.sourceLessons, suggestedQuestions: fallback.suggestedQuestions, checklist: fallback.checklist });
  }
  }); // end withObservability
}
