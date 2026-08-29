import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { academyPathTerms } from "@/data/academyPath";
import { caseStudiesForTerm } from "@/data/academyCaseStudies";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  computeBehavioralSnapshot,
  type BehavioralSnapshot,
} from "@/lib/behavioral-engine";
import { collectBehavioralInputs } from "@/lib/behavioral-context-server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getMentorContext } from "@/lib/mentor-memory";
import { ensureMentorThread, isMentorThreadId } from "@/lib/mentor-threads";
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
  prepareMentorPublicResearchEgress,
  secretIncidentResponse,
  type MentorBehavioralEgress,
  type MentorPublicResearchKind,
} from "@/lib/ai/mentor-trust-boundary";
import { type AiSourceReference } from "@/lib/ai/provider-router";
import { callAiProviderWithFailover } from "@/lib/ai/provider-failover";
import { recordOpenRouterQuotaSnapshot } from "@/lib/ai/automation-store";
import { managedAiLaunchStatus } from "@/lib/ai/managed-ai-launch-policy";
import {
  accountedAiProviderRouteCost,
  admitAiAgentExecution,
  aiEvidenceHash,
  loadVerifiedAiKnowledgeContext,
  markAiAgentSpendEgress,
  releaseUnmarkedAiAgentSpend,
  recordAiWorkflowEvidence,
  resolveRuntimeAiAgent,
  settleAiAgentSpend,
  settleAiAgentSpendAndRecordRoutingDecision,
} from "@/lib/ai/control-plane-store";
import {
  appendAiMentorEvidence,
  loadMentorAiPreferences,
  persistMentorConversationPair,
} from "@/lib/ai/mentor-trust-store";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { tenantProductVerdict } from "@/lib/security/tenant-product-entitlement";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";

type MentorRequest = {
  question?: string;
  locale?: "fa" | "en" | string;
  term?: number | string;
  lesson?: number | string;
  history?: unknown;
  progress?: unknown;
  behavioralContext?: unknown;
  mentorMode?: string;
  threadId?: string | null;
  researchMode?: string;
};

const MAX_QUESTION_LENGTH = 900;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function tenantIsolationError() {
  return apiError("ai_tenant_isolation_unresolved", 503, {
    blocker: managedAiLaunchStatus().blocker,
  });
}

function clean(value: unknown, max = 900): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function detectTerm(question: string, requestedTerm?: number): number {
  if (requestedTerm && requestedTerm >= 1 && requestedTerm <= 7)
    return requestedTerm;
  const q = question.toLowerCase();
  if (
    /seed|phrase|2fa|phishing|wallet|کیف پول|فیشینگ|امنیت|عبارت بازیابی|هک|پسورد|رمز/.test(
      q,
    )
  )
    return 2;
  if (
    /market order|limit|stop|oco|slippage|spread|اسلیپیج|سفارش|معامله|خرید|فروش|برداشت/.test(
      q,
    )
  )
    return 3;
  if (
    /fdv|market cap|توکنومیکس|tokenomics|whitepaper|vesting|tvl|وایت|پروژه|تیم|نقدشوندگی|کلاهبرداری/.test(
      q,
    )
  )
    return 4;
  if (
    /rsi|macd|کندل|حمایت|مقاومت|volume|trend|روند|اندیکاتور|نمودار|واگرایی/.test(
      q,
    )
  )
    return 5;
  if (
    /risk|position|drawdown|stop loss|ریسک|حد ضرر|سرمایه|سبد|dca|ضرر|سایز/.test(
      q,
    )
  )
    return 6;
  if (
    /fomo|fear|greed|revenge|psychology|ترس|طمع|انتقامی|هیجان|روانشناسی|ژورنال/.test(
      q,
    )
  )
    return 7;
  return 1;
}

function termKnowledge(termNumber: number, lessonNumber?: number) {
  const term =
    academyPathTerms.find((item) => item.number === termNumber) ||
    academyPathTerms[0];
  const selectedCaseStudies = caseStudiesForTerm(termNumber);
  const selectedLessons =
    lessonNumber && term.lessons[lessonNumber - 1]
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
            .map(
              (item) =>
                `- ${item.title}: ${item.summary} | تمرین: ${item.learnerTask}`,
            )
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
    1: [
      "فرق قیمت پایین و ارزش بازار چیست؟",
      "چرا بیت‌کوین کمیاب است اما سود تضمینی ندارد؟",
    ],
    2: ["Seed Phrase را امن کجا نگه دارم؟", "چطور لینک فیشینگ را تشخیص بدهم؟"],
    3: [
      "Market Order چه زمانی خطرناک می‌شود؟",
      "قبل از برداشت تتر چه چیزهایی را چک کنم؟",
    ],
    4: ["FDV و Vesting چه ریسکی دارند؟", "چطور Red Flag یک پروژه را پیدا کنم؟"],
    5: [
      "RSI بالا همیشه یعنی فروش؟",
      "حمایت و مقاومت را چطور با ریسک ترکیب کنم؟",
    ],
    6: [
      "با سرمایه فرضی چطور اندازه موقعیت را حساب کنم؟",
      "Drawdown را چطور کنترل کنم؟",
    ],
    7: [
      "وقتی FOMO دارم چه کنم؟",
      "ژورنال معاملاتی چه چیزهایی باید داشته باشد؟",
    ],
  };
  return bank[termNumber] || bank[1];
}

function localFallback(
  question: string,
  termNumber: number,
  lessonNumber?: number,
) {
  const knowledge = termKnowledge(termNumber, lessonNumber);
  const q = question.toLowerCase();
  let focus =
    "اول مفهوم را از تصمیم مالی جدا کن. پاسخ آموزشی تک‌پی جایگزین تحقیق شخصی یا توصیه خرید و فروش نیست؛ هدف این است که قبل از اقدام، سؤال درست‌تری بپرسی.";
  if (/rsi|macd|کندل|حمایت|مقاومت|نمودار/.test(q)) {
    focus =
      "تحلیل تکنیکال ابزار احتمالات است، نه دستور خرید یا فروش. RSI، MACD، حمایت و مقاومت فقط وقتی ارزش دارند که کنار روند، حجم، نقطه ابطال و مدیریت ریسک دیده شوند.";
  }
  if (/seed|phrase|کیف پول|فیشینگ|امنیت|هک/.test(q)) {
    focus =
      "در امنیت رمزارز، بعضی خطاها برگشت‌پذیر نیستند. اطلاعات محرمانه را آنلاین ذخیره نکن، دامنه رسمی را بررسی کن، 2FA را فعال کن و قبل از هر انتقال شبکه و آدرس را دوباره چک کن.";
  }
  if (/risk|ریسک|سرمایه|حد ضرر|position|ضرر/.test(q)) {
    focus =
      "قبل از فکر کردن به سود، باید بدانی اگر اشتباه کنی چقدر از کل سرمایه آسیب می‌بیند. اندازه موقعیت، حد ضرر و قانون توقف باید قبل از ورود مشخص باشد.";
  }
  if (/fdv|market cap|توکنومیکس|پروژه|vesting|whitepaper/.test(q)) {
    focus =
      "برای بررسی پروژه فقط قیمت یا تبلیغ کافی نیست. کاربرد واقعی، تیم، وایت‌پیپر، توکنومیکس، FDV، Vesting، نقدشوندگی و Red Flagها را کنار هم ببین.";
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

function behavioralEgress(
  snapshot: BehavioralSnapshot,
): MentorBehavioralEgress {
  const ranked = [...snapshot.dimensions].sort(
    (left, right) => left.score - right.score,
  );
  return {
    overallScore: snapshot.overallScore,
    dataQuality: snapshot.dataQuality,
    preferredLearningStyle: snapshot.preferredLearningStyle,
    learningVelocity: String(snapshot.learningVelocity),
    weakestDimensions: ranked.slice(0, 3).map((item) => ({
      dimension: item.dimension,
      score: item.score,
    })),
    strongestDimensions: ranked
      .slice(-2)
      .reverse()
      .map((item) => ({
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
  threadId?: string | null;
  sources?: AiSourceReference[];
  researchMode?: "off" | "public" | "public_blocked";
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
    threadId: input.threadId ?? null,
    sources: input.sources ?? [],
    researchMode: input.researchMode ?? "off",
  };
}

function publicResearchRoute(question: string): {
  agentId: "coin_tool_researcher" | "news_x_researcher";
  researchKind: MentorPublicResearchKind;
} {
  const newsOrX =
    /(?:خبر|اخبار|توییت|توئیت|ترند|امروز|همین\s*هفته|x\.com|twitter|tweet|latest|news|trend|today|this\s+week|announcement)/i.test(
      question,
    );
  return newsOrX
    ? {
        agentId: "news_x_researcher",
        researchKind: "news_x",
      }
    : {
        agentId: "coin_tool_researcher",
        researchKind: "coin_tool",
      };
}

function researchSourcesInMemory(
  answer: string,
  sources: readonly AiSourceReference[],
  locale: "fa" | "en",
): string {
  if (sources.length === 0) return answer;
  const heading = locale === "en" ? "Public sources:" : "منابع عمومی:";
  const lines = sources.slice(0, 8).map((source, index) => {
    const title =
      clean(source.title, 180) ||
      (locale === "en" ? `Source ${index + 1}` : `منبع ${index + 1}`);
    return `- ${title}: ${source.url}`;
  });
  return `${answer}\n\n${heading}\n${lines.join("\n")}`.slice(0, 12_000);
}

function publicResearchBlockedAnswer(locale: "fa" | "en"): string {
  if (locale === "en") {
    return "Public web research was not started because the query contains private data, financial account context, a secret-like value, or instruction-shaped text. Rewrite it as a public topic only—for example: ‘Compare the public security documentation of hardware wallet A and B.’";
  }
  return "پژوهش عمومی وب اجرا نشد، چون سؤال شامل دادهٔ خصوصی، وضعیت مالی شخصی، مقدار شبیه راز یا متن دستورگونه بود. سؤال را فقط درباره اطلاعات عمومی بازنویسی کن؛ مثلاً: «مستندات امنیتی عمومی کیف‌پول سخت‌افزاری A و B را مقایسه کن.»";
}

function publicResearchUnavailableAnswer(
  locale: "fa" | "en",
  academyFallback: string,
): string {
  return locale === "en"
    ? `Live public research is not available in this workspace right now, so no current-web claim is being presented as verified. Here is the bounded Academy guidance instead:\n\n${academyFallback}`
    : `پژوهش زندهٔ عمومی در این فضای کاری فعلاً آماده نیست؛ بنابراین هیچ ادعای وبِ جاری را تأییدشده نمایش نمی‌دهم. راهنمای محدود آکادمی را جایگزین می‌کنم:\n\n${academyFallback}`;
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/ai-mentor" }, async () => {
    if (!(await verifyCsrfOrigin(request))) return apiError("forbidden", 403);

    const session = await getCanonicalSession(request, {
      strictRevocation: true,
    });
    if (!session.isAcademyUser && !session.studentId) {
      return apiError("academy_login_required", 401);
    }

    const limit = await rateLimit(request, {
      namespace: "ai-mentor",
      limit: MAX_REQUESTS_PER_WINDOW,
      windowMs: WINDOW_MS,
      identity:
        session.studentId ??
        session.academyAccountId ??
        session.userId ??
        undefined,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const bounded = await readBoundedJsonRequest<MentorRequest>(request, {
      maxBytes: 24_000,
    });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = bounded.value;

    const rawQuestion = typeof body.question === "string" ? body.question : "";
    if (rawQuestion.trim().length < 2)
      return apiError("question_required", 400);
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
    const normalizedLesson =
      Number.isInteger(lessonNumber) && lessonNumber > 0
        ? lessonNumber
        : undefined;
    const fallback = localFallback(question, termNumber, normalizedLesson);
    const requestId = randomUUID();
    const studentId = session.studentId;
    const clientHistoryPresent =
      "history" in body || "progress" in body || "behavioralContext" in body;

    if (
      body.threadId !== undefined &&
      body.threadId !== null &&
      !isMentorThreadId(body.threadId)
    ) {
      return apiError("invalid_mentor_thread", 400);
    }

    // Resolve the acting tenant once and reuse that authority for history,
    // memory, persistence, provider routing and evidence. A student-global
    // Mentor record is still only reachable from a tenant to which the learner
    // is actively bound; a foreign branded host never gets to read or append it.
    let mentorEntitled = false;
    let egressGateReason = "no_student_principal";
    let authorizedStudentId: string | null = null;
    let activeTenantId: string | undefined;
    let activeWorkspaceId: string | undefined;
    if (studentId) {
      const tenantContext = await resolveTenantPrincipalContext({
        session,
        request,
        requiredPrincipalType: "student",
        scopes: ["academy:learning-events:read"],
        requestId: resolveSensitiveAuditCorrelation(
          request.headers.get("x-tecpey-request-id"),
        ),
      });
      if (!tenantContext.available) {
        egressGateReason =
          tenantContext.reason === "binding_storage_unavailable"
            ? "entitlement_authority_unavailable"
            : `tenant_${tenantContext.reason}`;
      } else {
        activeTenantId = tenantContext.tenantId;
        activeWorkspaceId = tenantContext.workspaceId;
        const verdict = await tenantProductVerdict(
          tenantContext.tenantId,
          "mentor",
        );
        if (verdict.entitled) {
          mentorEntitled = true;
          authorizedStudentId = tenantContext.principalId;
        } else {
          egressGateReason = verdict.reason;
        }
      }
    }

    if (inspection.blocked) {
      const evidencePersisted = await appendAiMentorEvidence({
        tenantId: activeTenantId,
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

    const threadResolution = authorizedStudentId
      ? await ensureMentorThread({
          studentId: authorizedStudentId,
          threadId: body.threadId ?? null,
          locale,
          titleHint: question,
        })
      : null;
    if (authorizedStudentId && !threadResolution) {
      return apiError(
        body.threadId
          ? "mentor_thread_not_found"
          : "mentor_threads_unavailable",
        body.threadId ? 404 : 503,
      );
    }
    const activeThreadId = threadResolution?.thread.id ?? null;

    const preferenceLoad = authorizedStudentId
      ? await loadMentorAiPreferences(authorizedStudentId)
      : null;
    const preferences = preferenceLoad?.preferences ?? {
      externalProviderEnabled: true,
      behavioralPersonalizationEnabled: false,
      realExchangeSignalsEnabled: false,
      consentVersion: AI_MENTOR_TRUST_POLICY_VERSION,
      consentedAt: null,
    };
    const personalizationApplied = Boolean(
      authorizedStudentId && preferences.behavioralPersonalizationEnabled,
    );

    const publicResearchRequested = body.researchMode === "public";
    const selectedResearchRoute = publicResearchRoute(question);

    const [mentorContext, behavioralInputs, verifiedKnowledgeResult] =
      await Promise.all([
        !publicResearchRequested && authorizedStudentId
          ? getMentorContext(authorizedStudentId, activeThreadId)
          : Promise.resolve(null),
        !publicResearchRequested &&
        personalizationApplied &&
        authorizedStudentId
          ? collectBehavioralInputs(authorizedStudentId, locale)
          : Promise.resolve(null),
        !publicResearchRequested && activeTenantId && activeWorkspaceId
          ? loadVerifiedAiKnowledgeContext({
              tenantId: activeTenantId,
              workspaceId: activeWorkspaceId,
              query: question,
              limit: 6,
            })
          : Promise.resolve([]),
      ]);
    const verifiedKnowledgeStatus = Array.isArray(verifiedKnowledgeResult)
      ? "loaded"
      : verifiedKnowledgeResult;
    const verifiedKnowledge = Array.isArray(verifiedKnowledgeResult)
      ? verifiedKnowledgeResult
      : [];
    const verifiedKnowledgeHashes = verifiedKnowledge.map(
      (item) => item.contentHash,
    );
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
      approvedKnowledge: verifiedKnowledge.map((item) => ({
        knowledgeType: item.knowledgeType,
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        statement: item.statement,
        contentHash: item.contentHash,
        confidence: item.confidence,
        dataClass: item.dataClass,
        sourceUrls: item.evidenceRefs.map((source) => source.url),
      })),
      mentorContext,
      behavioralContext: behavioralSnapshot
        ? behavioralEgress(behavioralSnapshot)
        : null,
      behavioralPersonalizationEnabled: personalizationApplied,
      clientHistoryPresent,
    });
    const publicResearchEgress = prepareMentorPublicResearchEgress({
      question,
      locale,
      researchKind: selectedResearchRoute.researchKind,
      asOfDate: new Date().toISOString().slice(0, 10),
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

    const persistLocal = async (
      answer: string,
      providerStatus: string,
      evidenceContext: typeof egress = egress,
      extraMetadata: Record<string, unknown> = {},
    ) => {
      const memoryPersisted = authorizedStudentId
        ? await persistMentorConversationPair({
            requestId,
            studentId: authorizedStudentId,
            question,
            answer,
            locale,
            termNumber,
            threadId: activeThreadId,
            contentClass: inspection.classes.includes("financial_sensitive")
              ? "financial_sensitive"
              : "personal",
          })
        : false;
      const evidencePersisted = await appendAiMentorEvidence({
        tenantId: activeTenantId,
        requestId,
        studentId: authorizedStudentId,
        phase: "local",
        provider: "none",
        policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
        contextClasses: evidenceContext.contextClasses,
        redactionCount: evidenceContext.redactionCount,
        injectionSignalCount: evidenceContext.injectionSignals.length,
        inputHash: evidenceContext.inputHash,
        inputChars: evidenceContext.inputChars,
        estimatedInputTokens: evidenceContext.estimatedInputTokens,
        estimatedOutputTokens: Math.ceil(answer.length / 3.2),
        outcome: "local_guidance",
        memoryPersisted,
        metadata: {
          client_history_ignored: egress.clientHistoryIgnored,
          personalization_applied: personalizationApplied,
          provider_status: providerStatus,
          verified_knowledge_count: verifiedKnowledge.length,
          verified_knowledge_hashes: verifiedKnowledgeHashes,
          verified_knowledge_status: verifiedKnowledgeStatus,
          ...extraMetadata,
        },
      });
      if (memoryPersisted && authorizedStudentId) {
        scheduleMentorProfileUpdate(
          authorizedStudentId,
          "mentor_conversation_saved",
        );
      }
      return { memoryPersisted, evidencePersisted };
    };

    if (publicResearchRequested) {
      const researchMetadata = {
        public_only: true,
        research_kind: selectedResearchRoute.researchKind,
        research_agent: selectedResearchRoute.agentId,
        private_mentor_context_excluded: true,
      };
      if (publicResearchEgress.blocked) {
        const answer = publicResearchBlockedAnswer(locale);
        const local = await persistLocal(
          answer,
          "public_research_blocked",
          publicResearchEgress,
          {
            ...researchMetadata,
            block_reasons: publicResearchEgress.blockReasons,
          },
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_blocked",
            source: "security_policy",
            externalProviderUsed: false,
            providerAttempted: false,
            providerStatus: "public_research_blocked",
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public_blocked",
          }),
        );
      }

      const researchRuntime =
        mentorEntitled &&
        activeTenantId &&
        activeWorkspaceId &&
        preferences.externalProviderEnabled
          ? await resolveRuntimeAiAgent(selectedResearchRoute.agentId, {
              tenantId: activeTenantId,
              workspaceId: activeWorkspaceId,
            })
          : null;
      const researchConfigured = researchRuntime?.status === "configured";
      if (researchRuntime?.status === "tenant_isolation_unresolved") {
        return tenantIsolationError();
      }
      const unavailableStatus = !mentorEntitled
        ? egressGateReason
        : !preferences.externalProviderEnabled
          ? "provider_disabled_by_user"
          : (researchRuntime?.status ?? "provider_not_configured");
      if (!researchConfigured || !activeTenantId || !activeWorkspaceId) {
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          unavailableStatus,
          publicResearchEgress,
          researchMetadata,
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: false,
            providerStatus: unavailableStatus,
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }
      if (!researchRuntime || researchRuntime.status !== "configured") {
        throw new Error(
          "ai_mentor_public_research_runtime_resolution_invariant_failed",
        );
      }

      const researchConfig = researchRuntime.config;
      const researchMaxOutputTokens = Math.min(
        1_600,
        researchConfig.limits.maxOutputTokens,
      );
      const researchUsage = await admitAiAgentExecution({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        agentId: selectedResearchRoute.agentId,
        configurationSource: researchConfig.configurationSource,
        idempotencyKey: `mentor-research:${requestId}`,
        estimatedInputTokens: publicResearchEgress.estimatedInputTokens,
        maxOutputTokens: researchMaxOutputTokens,
        limits: researchConfig.limits,
      });
      const workflowInputHash = aiEvidenceHash(
        "mentor-public-research-input",
        publicResearchEgress.input,
      );
      if (!researchUsage.ok) {
        if (researchUsage.reason === "tenant_isolation_unresolved") {
          return tenantIsolationError();
        }
        if (researchUsage.reason !== "unavailable") {
          await recordAiWorkflowEvidence({
            tenantId: activeTenantId,
            workspaceId: activeWorkspaceId,
            runId: requestId,
            workflowId: "mentor_public_research",
            agentId: selectedResearchRoute.agentId,
            providerId: researchConfig.providerId,
            model: researchConfig.model,
            inputHash: workflowInputHash,
            status: "blocked",
            approvalMode: researchConfig.approvalMode,
          });
        }
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          `agent_${researchUsage.reason}`,
          publicResearchEgress,
          researchMetadata,
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: false,
            providerStatus: `agent_${researchUsage.reason}`,
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }

      const [workflowAdmitted, mentorAdmitted] = await Promise.all([
        recordAiWorkflowEvidence({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          runId: requestId,
          workflowId: "mentor_public_research",
          agentId: selectedResearchRoute.agentId,
          providerId: researchConfig.providerId,
          model: researchConfig.model,
          inputHash: workflowInputHash,
          status: "admitted",
          inputTokens: publicResearchEgress.estimatedInputTokens,
          approvalMode: researchConfig.approvalMode,
        }),
        appendAiMentorEvidence({
          tenantId: activeTenantId,
          requestId,
          studentId: authorizedStudentId,
          phase: "admitted",
          provider: researchConfig.providerId,
          model: researchConfig.model,
          policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
          contextClasses: publicResearchEgress.contextClasses,
          redactionCount: publicResearchEgress.redactionCount,
          injectionSignalCount: publicResearchEgress.injectionSignals.length,
          inputHash: publicResearchEgress.inputHash,
          inputChars: publicResearchEgress.inputChars,
          estimatedInputTokens: publicResearchEgress.estimatedInputTokens,
          outcome: "provider_admitted",
          memoryPersisted: null,
          metadata: researchMetadata,
        }),
      ]);
      if (!workflowAdmitted || !mentorAdmitted) {
        await settleAiAgentSpend({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          agentId: selectedResearchRoute.agentId,
          reservationId: researchUsage.spend.reservationId,
          accountedCostUsdMicros: 0,
          egressAttemptId: null,
        });
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          "evidence_unavailable",
          publicResearchEgress,
          researchMetadata,
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: false,
            providerStatus: "evidence_unavailable",
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }

      const researchEgressMark = await markAiAgentSpendEgress({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        agentId: selectedResearchRoute.agentId,
        configurationSource: researchConfig.configurationSource,
        reservationId: researchUsage.spend.reservationId,
        attemptId: randomUUID(),
      });
      if (!researchEgressMark.ok) {
        await releaseUnmarkedAiAgentSpend({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          agentId: selectedResearchRoute.agentId,
          reservationId: researchUsage.spend.reservationId,
        });
        if (researchEgressMark.reason === "tenant_isolation_unresolved") {
          return tenantIsolationError();
        }
        throw new Error(
          `ai_mentor_public_research_egress_mark_${researchEgressMark.reason}`,
        );
      }
      const researchRoute = await callAiProviderWithFailover({
        agentId: selectedResearchRoute.agentId,
        primary: {
          providerId: researchConfig.providerId,
          apiKey: researchConfig.apiKey,
          model: researchConfig.model,
          fallbackModel: researchConfig.fallbackModel,
        },
        openRouter: researchConfig.openRouterFallback,
        routeCandidates: researchConfig.routeCandidates,
        approvalSatisfied: true,
        authorizedSpendUsdMicros: researchUsage.spend.reservedUsdMicros,
        dataClass: "public",
        criticality: "noncritical",
        externalEffect: false,
        instructions: publicResearchEgress.instructions,
        input: publicResearchEgress.input,
        requestSignal: request.signal,
        timeoutMs: 20_000,
        maxOutputTokens: researchMaxOutputTokens,
        circuitScope: `${activeTenantId}:${activeWorkspaceId}`,
      });
      const researchProvider = researchRoute.result;
      const researchSpendAndRouting =
        await settleAiAgentSpendAndRecordRoutingDecision({
          settlement: {
            tenantId: activeTenantId,
            workspaceId: activeWorkspaceId,
            agentId: selectedResearchRoute.agentId,
            reservationId: researchUsage.spend.reservationId,
            accountedCostUsdMicros:
              accountedAiProviderRouteCost(researchRoute),
            egressAttemptId: researchEgressMark.attemptId,
          },
          routing: {
            tenantId: activeTenantId,
            workspaceId: activeWorkspaceId,
            runId: requestId,
            agentId: selectedResearchRoute.agentId,
            providerId: researchProvider.providerId,
            routeMode: researchRoute.routeMode,
            decisionCode: researchProvider.ok
              ? "provider_completed"
              : `provider_${researchProvider.reason}`,
            candidateCount: researchRoute.candidateCount,
            dataClass: "public",
            criticality: "noncritical",
            externalEffect: false,
            approvalMode: researchConfig.approvalMode,
            spendReservationId: researchUsage.spend.reservationId,
            decisionHash: researchRoute.decisionHash,
            requestedModel: researchProvider.ok
              ? researchProvider.requestedModel
              : (researchProvider.model ?? researchConfig.model),
            actualModel: researchProvider.ok
              ? researchProvider.model
              : (researchProvider.model ?? null),
            providerAttemptCount: researchProvider.attempts,
          },
        });
      if (!researchSpendAndRouting.ok) {
        throw new Error(
          `ai_mentor_public_research_spend_routing_${researchSpendAndRouting.reason}`,
        );
      }
      if (researchRoute.openRouterKeyStatus) {
        await recordOpenRouterQuotaSnapshot({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          status: researchRoute.openRouterKeyStatus,
          creditFloorUsdMicros:
            researchConfig.openRouterFallback?.creditFloorUsdMicros ?? 0,
          source: "provider_api",
        });
      }
      if (!researchProvider.ok) {
        await recordAiWorkflowEvidence({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          runId: requestId,
          workflowId: "mentor_public_research",
          agentId: selectedResearchRoute.agentId,
          providerId: researchProvider.providerId,
          model: researchProvider.model ?? researchConfig.model,
          inputHash: workflowInputHash,
          status: researchProvider.reason === "timeout" ? "timeout" : "failed",
          durationMs: researchProvider.durationMs,
          approvalMode: researchConfig.approvalMode,
        });
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          `research_${researchProvider.reason}`,
          publicResearchEgress,
          {
            ...researchMetadata,
            attempts: researchProvider.attempts,
            duration_ms: researchProvider.durationMs,
            route_mode: researchRoute.routeMode,
            primary_failure_reason: researchRoute.primaryFailureReason,
          },
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: true,
            providerStatus: researchProvider.reason,
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }

      const researchInspection = inspectMentorOutput(researchProvider.text);
      const researchSafetyReasons = researchInspection.reasons.filter(
        (reason) =>
          reason !== "fabricated_source" ||
          researchProvider.sources.length === 0,
      );
      const cited = researchProvider.sources.length > 0;
      if (!cited || researchSafetyReasons.length > 0) {
        await recordAiWorkflowEvidence({
          tenantId: activeTenantId,
          workspaceId: activeWorkspaceId,
          runId: requestId,
          workflowId: "mentor_public_research",
          agentId: selectedResearchRoute.agentId,
          providerId: researchProvider.providerId,
          model: researchProvider.model,
          inputHash: workflowInputHash,
          outputHash: aiEvidenceHash(
            "mentor-public-research-output",
            researchProvider.text,
          ),
          status: "output_rejected",
          sources: researchProvider.sources,
          inputTokens: researchProvider.inputTokens,
          outputTokens: researchProvider.outputTokens,
          durationMs: researchProvider.durationMs,
          approvalMode: researchConfig.approvalMode,
        });
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          cited ? "research_output_rejected" : "research_sources_required",
          publicResearchEgress,
          {
            ...researchMetadata,
            citation_count: researchProvider.sources.length,
            output_safety_reason_count: researchSafetyReasons.length,
            route_mode: researchRoute.routeMode,
          },
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: true,
            providerStatus: cited ? "output_rejected" : "sources_required",
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }

      const workflowCompleted = await recordAiWorkflowEvidence({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        runId: requestId,
        workflowId: "mentor_public_research",
        agentId: selectedResearchRoute.agentId,
        providerId: researchProvider.providerId,
        model: researchProvider.model,
        inputHash: workflowInputHash,
        outputHash: aiEvidenceHash(
          "mentor-public-research-output",
          researchInspection.normalized,
        ),
        status: "completed",
        sources: researchProvider.sources,
        inputTokens: researchProvider.inputTokens,
        outputTokens: researchProvider.outputTokens,
        durationMs: researchProvider.durationMs,
        approvalMode: researchConfig.approvalMode,
      });
      if (!workflowCompleted) {
        const answer = publicResearchUnavailableAnswer(locale, fallback.answer);
        const local = await persistLocal(
          answer,
          "evidence_unavailable",
          publicResearchEgress,
          researchMetadata,
        );
        return apiOk(
          responseEnvelope({
            answer,
            fallback,
            mentorStatus: "research_unavailable",
            source: "academy_knowledge",
            externalProviderUsed: false,
            providerAttempted: true,
            providerStatus: "evidence_unavailable",
            memoryPersisted: local.memoryPersisted,
            memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
            evidencePersisted: local.evidencePersisted,
            personalizationApplied: false,
            remaining: limit.remaining,
            threadId: activeThreadId,
            researchMode: "public",
          }),
        );
      }

      const answer = researchInspection.normalized;
      const memoryAnswer = researchSourcesInMemory(
        answer,
        researchProvider.sources,
        locale,
      );
      const memoryPersisted = authorizedStudentId
        ? await persistMentorConversationPair({
            requestId,
            studentId: authorizedStudentId,
            question,
            answer: memoryAnswer,
            locale,
            termNumber,
            threadId: activeThreadId,
            contentClass: inspection.classes.includes("financial_sensitive")
              ? "financial_sensitive"
              : "personal",
          })
        : false;
      const completionEvidence = await appendAiMentorEvidence({
        tenantId: activeTenantId,
        requestId,
        studentId: authorizedStudentId,
        phase: "completed",
        provider: researchProvider.providerId,
        model: researchProvider.model,
        policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
        contextClasses: publicResearchEgress.contextClasses,
        redactionCount: publicResearchEgress.redactionCount,
        injectionSignalCount: publicResearchEgress.injectionSignals.length,
        inputHash: publicResearchEgress.inputHash,
        inputChars: publicResearchEgress.inputChars,
        estimatedInputTokens: researchProvider.inputTokens,
        estimatedOutputTokens: researchProvider.outputTokens,
        outcome: "provider_success",
        memoryPersisted,
        metadata: {
          ...researchMetadata,
          citation_count: researchProvider.sources.length,
          attempts: researchProvider.attempts,
          duration_ms: researchProvider.durationMs,
          route_mode: researchRoute.routeMode,
          primary_failure_reason: researchRoute.primaryFailureReason,
        },
      });
      if (memoryPersisted && authorizedStudentId) {
        scheduleMentorProfileUpdate(
          authorizedStudentId,
          "mentor_conversation_saved",
        );
      }
      return apiOk(
        responseEnvelope({
          answer,
          fallback,
          mentorStatus: "research_active",
          source: "public_research_cited",
          externalProviderUsed: true,
          providerAttempted: true,
          providerStatus: "provider_success",
          memoryPersisted,
          memoryMode: memoryPersisted ? "durable" : "ephemeral",
          evidencePersisted: completionEvidence,
          personalizationApplied: false,
          remaining: limit.remaining,
          threadId: activeThreadId,
          sources: researchProvider.sources,
          researchMode: "public",
        }),
      );
    }

    const lowCostPattern =
      /^(سلام|درود|hi|hello|thanks|thank you|ممنون|مرسی)[.!؟\s]*$/i;
    const externalManagedPathRequested =
      mentorEntitled &&
      activeTenantId &&
      activeWorkspaceId &&
      preferences.externalProviderEnabled &&
      !lowCostPattern.test(question);
    const runtimeAgent = externalManagedPathRequested
        ? await resolveRuntimeAiAgent("mentor_coach", {
            tenantId: activeTenantId,
            workspaceId: activeWorkspaceId,
          })
        : null;
    if (runtimeAgent?.status === "tenant_isolation_unresolved") {
      return tenantIsolationError();
    }
    const runtimeConfigured = runtimeAgent?.status === "configured";
    const localProviderStatus = !mentorEntitled
      ? egressGateReason
      : !preferences.externalProviderEnabled
        ? "provider_disabled_by_user"
        : lowCostPattern.test(question)
          ? "local_low_cost_path"
          : (runtimeAgent?.status ?? "provider_not_configured");
    if (
      !runtimeConfigured ||
      !mentorEntitled ||
      !preferences.externalProviderEnabled ||
      lowCostPattern.test(question)
    ) {
      const local = await persistLocal(
        fallback.answer,
        localProviderStatus,
      );
      return apiOk(
        responseEnvelope({
          answer: fallback.answer,
          fallback,
          mentorStatus: "guided_from_academy",
          source: "academy_knowledge",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: localProviderStatus,
          memoryPersisted: local.memoryPersisted,
          memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
          evidencePersisted: local.evidencePersisted,
          personalizationApplied,
          remaining: limit.remaining,
          threadId: activeThreadId,
        }),
      );
    }

    if (!runtimeAgent || runtimeAgent.status !== "configured") {
      throw new Error("ai_mentor_runtime_resolution_invariant_failed");
    }
    if (!activeTenantId || !activeWorkspaceId) {
      throw new Error("ai_mentor_runtime_scope_invariant_failed");
    }
    const providerConfig = runtimeAgent.config;
    const maxOutputTokens = Math.min(
      800,
      providerConfig.limits.maxOutputTokens,
    );
    const usage = await admitAiAgentExecution({
      tenantId: activeTenantId,
      workspaceId: activeWorkspaceId,
      agentId: "mentor_coach",
      configurationSource: providerConfig.configurationSource,
      idempotencyKey: `mentor-response:${requestId}`,
      estimatedInputTokens: egress.estimatedInputTokens,
      maxOutputTokens,
      limits: providerConfig.limits,
    });
    if (!usage.ok) {
      if (usage.reason === "tenant_isolation_unresolved") {
        return tenantIsolationError();
      }
      const local = await persistLocal(
        fallback.answer,
        `agent_${usage.reason}`,
      );
      return apiOk(
        responseEnvelope({
          answer: fallback.answer,
          fallback,
          mentorStatus: "safe_guidance",
          source: "academy_knowledge",
          externalProviderUsed: false,
          providerAttempted: false,
          providerStatus: `agent_${usage.reason}`,
          memoryPersisted: local.memoryPersisted,
          memoryMode: local.memoryPersisted ? "durable" : "ephemeral",
          evidencePersisted: local.evidencePersisted,
          personalizationApplied,
          remaining: limit.remaining,
          threadId: activeThreadId,
        }),
      );
    }
    const admitted = await appendAiMentorEvidence({
      tenantId: activeTenantId,
      requestId,
      studentId: authorizedStudentId,
      phase: "admitted",
      provider: providerConfig.providerId,
      model: providerConfig.model,
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
        configuration_source: providerConfig.configurationSource,
        verified_knowledge_count: verifiedKnowledge.length,
        verified_knowledge_hashes: verifiedKnowledgeHashes,
        verified_knowledge_status: verifiedKnowledgeStatus,
      },
    });

    if (!admitted) {
      await settleAiAgentSpend({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        agentId: "mentor_coach",
        reservationId: usage.spend.reservationId,
        accountedCostUsdMicros: 0,
        egressAttemptId: null,
      });
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
          threadId: activeThreadId,
        }),
      );
    }

    const providerEgressMark = await markAiAgentSpendEgress({
      tenantId: activeTenantId,
      workspaceId: activeWorkspaceId,
      agentId: "mentor_coach",
      configurationSource: providerConfig.configurationSource,
      reservationId: usage.spend.reservationId,
      attemptId: randomUUID(),
    });
    if (!providerEgressMark.ok) {
      await releaseUnmarkedAiAgentSpend({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        agentId: "mentor_coach",
        reservationId: usage.spend.reservationId,
      });
      if (providerEgressMark.reason === "tenant_isolation_unresolved") {
        return tenantIsolationError();
      }
      throw new Error(`ai_mentor_egress_mark_${providerEgressMark.reason}`);
    }
    const providerRoute = await callAiProviderWithFailover({
      agentId: "mentor_coach",
      primary: {
        providerId: providerConfig.providerId,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
        fallbackModel: providerConfig.fallbackModel,
      },
      openRouter: providerConfig.openRouterFallback,
      routeCandidates: providerConfig.routeCandidates,
      approvalSatisfied: true,
      authorizedSpendUsdMicros: usage.spend.reservedUsdMicros,
      dataClass: "private_user",
      criticality: "standard",
      externalEffect: false,
      instructions: egress.instructions,
      input: egress.input,
      requestSignal: request.signal,
      timeoutMs: Number(process.env.AI_MENTOR_PROVIDER_TIMEOUT_MS) || 9_000,
      maxOutputTokens,
      circuitScope: `${activeTenantId}:${activeWorkspaceId}`,
    });
    const provider = providerRoute.result;
    const spendAndRouting = await settleAiAgentSpendAndRecordRoutingDecision({
      settlement: {
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        agentId: "mentor_coach",
        reservationId: usage.spend.reservationId,
        accountedCostUsdMicros: accountedAiProviderRouteCost(providerRoute),
        egressAttemptId: providerEgressMark.attemptId,
      },
      routing: {
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        runId: requestId,
        agentId: "mentor_coach",
        providerId: provider.providerId,
        routeMode: providerRoute.routeMode,
        decisionCode: provider.ok
          ? "provider_completed"
          : `provider_${provider.reason}`,
        candidateCount: providerRoute.candidateCount,
        dataClass: "private_user",
        criticality: "standard",
        externalEffect: false,
        approvalMode: providerConfig.approvalMode,
        spendReservationId: usage.spend.reservationId,
        decisionHash: providerRoute.decisionHash,
        requestedModel: provider.ok
          ? provider.requestedModel
          : (provider.model ?? providerConfig.model),
        actualModel: provider.ok ? provider.model : (provider.model ?? null),
        providerAttemptCount: provider.attempts,
      },
    });
    if (!spendAndRouting.ok) {
      throw new Error(`ai_mentor_spend_routing_${spendAndRouting.reason}`);
    }
    if (providerRoute.openRouterKeyStatus) {
      await recordOpenRouterQuotaSnapshot({
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        status: providerRoute.openRouterKeyStatus,
        creditFloorUsdMicros:
          providerConfig.openRouterFallback?.creditFloorUsdMicros ?? 0,
        source: "provider_api",
      });
    }

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
    const actualModel = provider.ok
      ? provider.model
      : (provider.model ?? providerConfig.model);
    let outputSafetyReasons = 0;

    if (provider.ok) {
      const outputInspection = inspectMentorOutput(provider.text);
      if (outputInspection.safe) {
        answer = outputInspection.normalized;
        completionOutcome = "provider_success";
        providerStatus = "provider_success";
        externalProviderUsed = true;
        outputTokens = provider.outputTokens;
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

    const memoryPersisted = authorizedStudentId
      ? await persistMentorConversationPair({
          requestId,
          studentId: authorizedStudentId,
          question,
          answer,
          locale,
          termNumber,
          threadId: activeThreadId,
          contentClass: inspection.classes.includes("financial_sensitive")
            ? "financial_sensitive"
            : "personal",
        })
      : false;
    const completionEvidence = await appendAiMentorEvidence({
      tenantId: activeTenantId,
      requestId,
      studentId: authorizedStudentId,
      phase: "completed",
      provider: provider.providerId,
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
        route_mode: providerRoute.routeMode,
        primary_failure_reason: providerRoute.primaryFailureReason,
        output_safety_reason_count: outputSafetyReasons,
        verified_knowledge_count: verifiedKnowledge.length,
        verified_knowledge_hashes: verifiedKnowledgeHashes,
      },
    });
    if (memoryPersisted && authorizedStudentId) {
      scheduleMentorProfileUpdate(
        authorizedStudentId,
        "mentor_conversation_saved",
      );
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
        threadId: activeThreadId,
      }),
    );
  });
}
