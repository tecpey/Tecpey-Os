import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { academyPathTerms } from "@/data/academyPath";
import { caseStudiesForTerm } from "@/data/academyCaseStudies";
import { getCanonicalSession } from "@/lib/auth-session";
import { computeBehavioralSnapshot, type BehavioralSnapshot } from "@/lib/behavioral-engine";
import { collectBehavioralInputs } from "@/lib/behavioral-context-server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getMentorContext } from "@/lib/mentor-memory";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, apiRateLimited } from "@/lib/api-validation";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  AI_MENTOR_TRUST_POLICY_VERSION,
  inspectMentorOutput,
  inspectMentorUserText,
  prepareMentorEgress,
  secretIncidentResponse,
  type MentorBehavioralEgress,
} from "@/lib/ai/mentor-trust-boundary";
import { callMentorProvider } from "@/lib/ai/mentor-provider";
import {
  appendAiMentorEvidence,
  loadMentorAiPreferences,
  persistMentorConversationPair,
} from "@/lib/ai/mentor-trust-store";

type MentorRequest = {
  question?: string;
  locale?: "fa" | "en" | string;
  term?: number | string;
  lesson?: number | string;
  history?: unknown;
  progress?: unknown;
  behavioralContext?: unknown;
  mentorMode?: string;
};

const MAX_QUESTION_LENGTH = 900;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function clean(value: unknown, max = 900): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function detectTerm(question: string, requestedTerm?: number): number {
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
      selectedCaseStudies.length
        ? `پرونده‌های عملی این ترم:\n${selectedCaseStudies
            .map((item) => `- ${item.title}: ${item.summary} | تمرین: ${item.learnerTask}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sourceLessons: selectedLessons.map((lesson, index) => ({
      title: lesson[0],
      href: `/academy/${term.slug}#lesson-${lessonNumber || index + 1}`,
    })),
  };
}

function suggestedQuestions(termNumber: number): string[] {
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
  let focus = "اول مفهوم را از تصمیم مالی جدا کن. پاسخ آموزشی تک‌پی جایگزین تحقیق شخصی یا توصیه خرید و فروش نیست؛ هدف این است که قبل از اقدام، سؤال درست‌تری بپرسی.";
  if (/rsi|macd|کندل|حمایت|مقاومت|نمودار/.test(q)) {
    focus = "تحلیل تکنیکال ابزار احتمالات است، نه دستور خرید یا فروش. RSI، MACD، حمایت و مقاومت فقط وقتی ارزش دارند که کنار روند، حجم، نقطه ابطال و مدیریت ریسک دیده شوند.";
  }
  if (/seed|phrase|کیف پول|فیشینگ|امنیت|هک/.test(q)) {
    focus = "در امنیت رمزارز، بعضی خطاها برگشت‌پذیر نیستند. اطلاعات محرمانه را آنلاین ذخیره نکن، دامنه رسمی را بررسی کن، 2FA را فعال کن و قبل از هر انتقال شبکه و آدرس را دوباره چک کن.";
  }
  if (/risk|ریسک|سرمایه|حد ضرر|position|ضرر/.test(q)) {
    focus = "قبل از فکر کردن به سود، باید بدانی اگر اشتباه کنی چقدر از کل سرمایه آسیب می‌بیند. اندازه موقعیت، حد ضرر و قانون توقف باید قبل از ورود مشخص باشد.";
  }
  if (/fdv|market cap|توکنومیکس|پروژه|vesting|whitepaper/.test(q)) {
    focus = "برای بررسی پروژه فقط قیمت یا تبلیغ کافی نیست. کاربرد واقعی، تیم، وایت‌پیپر، توکنومیکس، FDV، Vesting، نقدشوندگی و Red Flagها را کنار هم ببین.";
  }

  return {
    answer: `${focus}\n\nدرس مرتبط: ${knowledge.term.title}\n\nقدم بعدی: یک مثال واقعی از سؤال خودت بنویس و از خودت بپرس اگر تحلیل من اشتباه باشد، چه چیزی از دست می‌دهم؟`,
    mode: "fallback",
    relatedTerm: {
      number: knowledge.term.number,
      title: knowledge.term.title,
      href: `/academy/${knowledge.term.slug}`,
    },
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

function behavioralEgress(snapshot: BehavioralSnapshot): MentorBehavioralEgress {
  const ranked = [...snapshot.dimensions].sort((left, right) => left.score - right.score);
  return {
    overallScore: snapshot.overallScore,
    dataQuality: snapshot.dataQuality,
    preferredLearningStyle: snapshot.preferredLearningStyle,
    learningVelocity: String(snapshot.learningVelocity),
    weakestDimensions: ranked.slice(0, 3).map((item) => ({
      dimension: item.dimension,
      score: item.score,
    })),
    strongestDimensions: ranked.slice(-2).reverse().map((item) => ({
      dimension: item.dimension,
      score: item.score,
    })),
  };
}

function responseEnvelope(input: {
  answer: string;
  fallback: ReturnType<typeof localFallback>;
  mentorStatus: string;
  source: string;
  externalProviderUsed: boolean;
  providerAttempted: boolean;
  providerStatus: string;
  memoryPersisted: boolean;
  memoryMode: "durable" | "ephemeral" | "not_recorded";
  evidencePersisted: boolean;
  personalizationApplied: boolean;
  remaining: number;
}) {
  return {
    mentorStatus: input.mentorStatus,
    answer: input.answer,
    relatedTerm: input.fallback.relatedTerm,
    sourceLessons: input.fallback.sourceLessons,
    suggestedQuestions: input.fallback.suggestedQuestions,
    checklist: input.fallback.checklist,
    source: input.source,
    externalProviderUsed: input.externalProviderUsed,
    providerAttempted: input.providerAttempted,
    providerStatus: input.providerStatus,
    memoryPersisted: input.memoryPersisted,
    memoryMode: input.memoryMode,
    evidencePersisted: input.evidencePersisted,
    personalizationApplied: input.personalizationApplied,
    trustPolicyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
    rateLimit: { remaining: input.remaining },
  };
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/ai-mentor" }, async () => {
    if (!verifyCsrfOrigin(request)) return apiError("forbidden", 403);

    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.isAcademyUser && !session.studentId) {
      return apiError("academy_login_required", 401);
    }

    const limit = await rateLimit(request, {
      namespace: "ai-mentor",
      limit: MAX_REQUESTS_PER_WINDOW,
      windowMs: WINDOW_MS,
      identity: session.studentId ?? session.academyAccountId ?? session.userId ?? undefined,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const bounded = await readBoundedJsonRequest<MentorRequest>(request, {
      maxBytes: 24_000,
    });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = bounded.value;

    const rawQuestion = typeof body.question === "string" ? body.question : "";
    if (rawQuestion.trim().length < 2) return apiError("question_required", 400);
    if (rawQuestion.length > MAX_QUESTION_LENGTH) {
      return apiError("question_too_long", 400, { max: MAX_QUESTION_LENGTH });
    }

    const locale: "fa" | "en" = body.locale === "en" ? "en" : "fa";
    const requestedTerm = Number(body.term);
    const lessonNumber = Number(body.lesson);
    const inspection = inspectMentorUserText(rawQuestion);
    const question = inspection.normalized;
    const termNumber = detectTerm(
      question,
      Number.isInteger(requestedTerm) ? requestedTerm : undefined,
    );
    const normalizedLesson = Number.isInteger(lessonNumber) && lessonNumber > 0
      ? lessonNumber
      : undefined;
    const fallback = localFallback(question, termNumber, normalizedLesson);
    const requestId = randomUUID();
    const studentId = session.studentId;
    const clientHistoryPresent = "history" in body ||
      "progress" in body ||
      "behavioralContext" in body;

    if (inspection.blocked) {
      const evidencePersisted = await appendAiMentorEvidence({
        requestId,
        studentId,
        phase: "blocked",
        provider: "none",
        policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
        contextClasses: inspection.classes,
        redactionCount: inspection.redactionCount,
        injectionSignalCount: inspection.injectionSignals.length,
        inputHash: inspection.inputHash,
        inputChars: inspection.normalized.length,
        estimatedInputTokens: Math.ceil(inspection.normalized.length / 3.2),
        outcome: "blocked_secret",
        memoryPersisted: false,
        metadata: {
          client_history_ignored: clientHistoryPresent,
          secret_kind_count: inspection.secretKinds.length,
        },
      });
      return apiOk(
        responseEnvelope({
          answer: secretIncidentResponse(locale),
          fallback,
          mentorStatus: "blocked_secret",
          source: "security_policy",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: "blocked_before_egress",
          memoryPersisted: false,
          memoryMode: "not_recorded",
          evidencePersisted,
          personalizationApplied: false,
          remaining: limit.remaining,
        }),
      );
    }

    const preferenceLoad = studentId
      ? await loadMentorAiPreferences(studentId)
      : null;
    const preferences = preferenceLoad?.preferences ?? {
      externalProviderEnabled: true,
      behavioralPersonalizationEnabled: false,
      realExchangeSignalsEnabled: false,
      consentVersion: AI_MENTOR_TRUST_POLICY_VERSION,
      consentedAt: null,
    };
    const personalizationApplied = Boolean(
      studentId && preferences.behavioralPersonalizationEnabled,
    );

    const [mentorContext, behavioralInputs] = await Promise.all([
      studentId ? getMentorContext(studentId) : Promise.resolve(null),
      personalizationApplied && studentId
        ? collectBehavioralInputs(studentId, locale)
        : Promise.resolve(null),
    ]);
    const behavioralSnapshot = behavioralInputs
      ? computeBehavioralSnapshot(behavioralInputs)
      : null;
    const knowledge = termKnowledge(termNumber, normalizedLesson);
    const egress = prepareMentorEgress({
      question,
      locale,
      mentorMode: clean(body.mentorMode, 40),
      curriculum: {
        termNumber,
        termTitle: knowledge.term.title,
        lessonNumber: normalizedLesson,
        knowledge: knowledge.text,
      },
      mentorContext,
      behavioralContext: behavioralSnapshot
        ? behavioralEgress(behavioralSnapshot)
        : null,
      behavioralPersonalizationEnabled: personalizationApplied,
      clientHistoryPresent,
    });

    if (egress.blocked) {
      return apiOk(
        responseEnvelope({
          answer: secretIncidentResponse(locale),
          fallback,
          mentorStatus: "blocked_secret",
          source: "security_policy",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: "blocked_before_egress",
          memoryPersisted: false,
          memoryMode: "not_recorded",
          evidencePersisted: false,
          personalizationApplied: false,
          remaining: limit.remaining,
        }),
      );
    }

    const persistLocal = async (answer: string, providerStatus: string) => {
      const memoryPersisted = studentId
        ? await persistMentorConversationPair({
            requestId,
            studentId,
            question,
            answer,
            locale,
            termNumber,
            contentClass: inspection.classes.includes("financial_sensitive")
              ? "financial_sensitive"
              : "personal",
          })
        : false;
      const evidencePersisted = await appendAiMentorEvidence({
        requestId,
        studentId,
        phase: "local",
        provider: "none",
        policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
        contextClasses: egress.contextClasses,
        redactionCount: egress.redactionCount,
        injectionSignalCount: egress.injectionSignals.length,
        inputHash: egress.inputHash,
        inputChars: egress.inputChars,
        estimatedInputTokens: egress.estimatedInputTokens,
        estimatedOutputTokens: Math.ceil(answer.length / 3.2),
        outcome: "local_guidance",
        memoryPersisted,
        metadata: {
          client_history_ignored: egress.clientHistoryIgnored,
          personalization_applied: personalizationApplied,
          provider_status: providerStatus,
        },
      });
      if (memoryPersisted && studentId) {
        scheduleMentorProfileUpdate(studentId, "mentor_conversation");
      }
      return { memoryPersisted, evidencePersisted };
    };

    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    const lowCostPattern = /^(سلام|درود|hi|hello|thanks|thank you|ممنون|مرسی)[.!؟\s]*$/i;
    if (
      !apiKey ||
      !preferences.externalProviderEnabled ||
      lowCostPattern.test(question)
    ) {
      const local = await persistLocal(
        fallback.answer,
        !apiKey
          ? "provider_not_configured"
          : preferences.externalProviderEnabled
            ? "local_low_cost_path"
            : "provider_disabled_by_user",
      );
      return apiOk(
        responseEnvelope({
          answer: fallback.answer,
          fallback,
          mentorStatus: "guided_from_academy",
          source: "academy_knowledge",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: !apiKey
            ? "provider_not_configured"
            : preferences.externalProviderEnabled
              ? "local_low_cost_path"
              : "provider_disabled_by_user",
          memoryPersisted: local.memoryPersisted,
          memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
          evidencePersisted: local.evidencePersisted,
          personalizationApplied,
          remaining: limit.remaining,
        }),
      );
    }

    const primaryModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const fallbackModel = process.env.OPENAI_MODEL_FALLBACK || "gpt-4.1-mini";
    const admitted = await appendAiMentorEvidence({
      requestId,
      studentId,
      phase: "admitted",
      provider: "openai",
      model: primaryModel,
      policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
      contextClasses: egress.contextClasses,
      redactionCount: egress.redactionCount,
      injectionSignalCount: egress.injectionSignals.length,
      inputHash: egress.inputHash,
      inputChars: egress.inputChars,
      estimatedInputTokens: egress.estimatedInputTokens,
      outcome: "provider_admitted",
      memoryPersisted: null,
      metadata: {
        client_history_ignored: egress.clientHistoryIgnored,
        personalization_applied: personalizationApplied,
        preference_store_available: preferenceLoad?.available ?? false,
      },
    });

    if (!admitted) {
      const local = await persistLocal(fallback.answer, "evidence_unavailable");
      return apiOk(
        responseEnvelope({
          answer: fallback.answer,
          fallback,
          mentorStatus: "safe_guidance",
          source: "academy_knowledge",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: "evidence_unavailable",
          memoryPersisted: local.memoryPersisted,
          memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
          evidencePersisted: local.evidencePersisted,
          personalizationApplied,
          remaining: limit.remaining,
        }),
      );
    }

    const provider = await callMentorProvider({
      apiKey,
      primaryModel,
      fallbackModel,
      instructions: egress.instructions,
      input: egress.input,
      requestSignal: request.signal,
      timeoutMs: Number(process.env.AI_MENTOR_PROVIDER_TIMEOUT_MS) || 9_000,
      maxOutputTokens: 800,
    });

    let answer = fallback.answer;
    let completionOutcome:
      | "provider_success"
      | "provider_failure"
      | "provider_timeout"
      | "provider_circuit_open"
      | "output_rejected" = "provider_failure";
    let providerStatus = provider.ok ? "provider_success" : provider.reason;
    let externalProviderUsed = false;
    let outputTokens = 0;
    const actualModel = provider.ok ? provider.model : provider.model ?? primaryModel;
    let outputSafetyReasons = 0;

    if (provider.ok) {
      const outputInspection = inspectMentorOutput(provider.answer);
      if (outputInspection.safe) {
        answer = outputInspection.normalized;
        completionOutcome = "provider_success";
        providerStatus = "provider_success";
        externalProviderUsed = true;
        outputTokens = provider.estimatedOutputTokens;
      } else {
        completionOutcome = "output_rejected";
        providerStatus = "output_rejected";
        outputSafetyReasons = outputInspection.reasons.length;
      }
    } else if (provider.reason === "timeout") {
      completionOutcome = "provider_timeout";
    } else if (provider.reason === "circuit_open") {
      completionOutcome = "provider_circuit_open";
    }

    const memoryPersisted = studentId
      ? await persistMentorConversationPair({
          requestId,
          studentId,
          question,
          answer,
          locale,
          termNumber,
          contentClass: inspection.classes.includes("financial_sensitive")
            ? "financial_sensitive"
            : "personal",
        })
      : false;
    const completionEvidence = await appendAiMentorEvidence({
      requestId,
      studentId,
      phase: "completed",
      provider: "openai",
      model: actualModel,
      policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
      contextClasses: egress.contextClasses,
      redactionCount: egress.redactionCount,
      injectionSignalCount: egress.injectionSignals.length,
      inputHash: egress.inputHash,
      inputChars: egress.inputChars,
      estimatedInputTokens: egress.estimatedInputTokens,
      estimatedOutputTokens: outputTokens || Math.ceil(answer.length / 3.2),
      outcome: completionOutcome,
      memoryPersisted,
      metadata: {
        client_history_ignored: egress.clientHistoryIgnored,
        personalization_applied: personalizationApplied,
        attempts: provider.attempts,
        duration_ms: provider.durationMs,
        provider_status: providerStatus,
        output_safety_reason_count: outputSafetyReasons,
      },
    });
    if (memoryPersisted && studentId) {
      scheduleMentorProfileUpdate(studentId, "mentor_conversation");
    }

    return apiOk(
      responseEnvelope({
        answer,
        fallback,
        mentorStatus: externalProviderUsed ? "active" : "safe_guidance",
        source: externalProviderUsed ? "ai_plus_academy" : "academy_knowledge",
        externalProviderUsed,
        providerAttempted: true,
        providerStatus,
        memoryPersisted,
        memoryMode: memoryPersisted ? "durable" : "ephemeral",
        evidencePersisted: completionEvidence,
        personalizationApplied,
        remaining: limit.remaining,
      }),
    );
  });
}
