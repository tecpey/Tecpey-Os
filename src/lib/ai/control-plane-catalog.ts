export const AI_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "perplexity",
  "xai",
  "openrouter",
  "x_api",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export type AiModelProviderId = Exclude<AiProviderId, "x_api">;

export const AI_AGENT_IDS = [
  "mentor_coach",
  "news_x_researcher",
  "coin_tool_researcher",
  "content_reviewer",
  "executive_briefing",
  "knowledge_curator",
  "risk_compliance_reviewer",
] as const;

export type AiAgentId = (typeof AI_AGENT_IDS)[number];

export type AiApprovalMode =
  | "none"
  | "before_publish"
  | "before_knowledge_promotion"
  | "before_external_effect";

export const AI_DATA_CLASSES = [
  "public",
  "aggregate_deidentified",
  "approved_platform_content",
  "private_user",
  "restricted_admin",
] as const;

export type AiDataClass = (typeof AI_DATA_CLASSES)[number];

export function isAiDataClass(value: unknown): value is AiDataClass {
  return AI_DATA_CLASSES.includes(value as AiDataClass);
}

export type AiOpenRouterFallbackPolicy = Readonly<{
  allowedDataClasses: readonly AiDataClass[];
  freeAllowed: boolean;
  requireZeroDataRetention: true;
  denyProviderDataCollection: true;
}>;

export type AiProviderCatalogItem = Readonly<{
  id: AiProviderId;
  kind: "model" | "data_connector";
  label: string;
  purposeFa: string;
  purposeEn: string;
  capabilities: readonly string[];
  fixedEndpointHost: string;
  secretLabel: string;
}>;

export type AiAgentCatalogItem = Readonly<{
  id: AiAgentId;
  labelFa: string;
  labelEn: string;
  responsibilityFa: string;
  responsibilityEn: string;
  allowedProviders: readonly AiModelProviderId[];
  allowedTools: readonly string[];
  readableScopes: readonly string[];
  forbiddenActions: readonly string[];
  approvalMode: AiApprovalMode;
  citationsRequired: boolean;
  mayReceivePrivateUserData: boolean;
  mayPublish: false;
  openRouterFallback: AiOpenRouterFallbackPolicy;
  defaultLimits: Readonly<{
    dailyRequests: number;
    dailyTokens: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    monthlyBudgetUsdMicros: number;
  }>;
}>;

export const AI_PROVIDER_CATALOG: readonly AiProviderCatalogItem[] =
  Object.freeze([
    {
      id: "openai",
      kind: "model",
      label: "OpenAI / GPT",
      purposeFa:
        "مربی، استدلال ساختاریافته و جمع‌بندی مدیریتی با Responses API و نگهداری خاموش.",
      purposeEn:
        "Mentoring, structured reasoning and executive synthesis through the Responses API with storage disabled.",
      capabilities: ["text", "reasoning", "structured_output", "web_search"],
      fixedEndpointHost: "api.openai.com",
      secretLabel: "OpenAI API key",
    },
    {
      id: "anthropic",
      kind: "model",
      label: "Anthropic / Claude",
      purposeFa:
        "بازبینی عمیق محتوا، کنترل کیفیت و بررسی ریسک؛ بدون مجوز انتشار مستقیم.",
      purposeEn:
        "Deep content review, quality control and risk analysis without direct publishing authority.",
      capabilities: ["text", "reasoning", "review", "web_search"],
      fixedEndpointHost: "api.anthropic.com",
      secretLabel: "Anthropic API key",
    },
    {
      id: "perplexity",
      kind: "model",
      label: "Perplexity",
      purposeFa: "پژوهش وبِ منبع‌دار درباره ابزارها، کوین‌ها و ادعاهای خبری.",
      purposeEn:
        "Source-grounded web research for tools, assets and news claims.",
      capabilities: ["text", "web_search", "citations"],
      fixedEndpointHost: "api.perplexity.ai",
      secretLabel: "Perplexity API key",
    },
    {
      id: "xai",
      kind: "model",
      label: "xAI / Grok",
      purposeFa:
        "پژوهش عمومی خبر و گفت‌وگوهای X با ابزارهای x_search و web_search.",
      purposeEn:
        "Public news and X-conversation research with x_search and web_search tools.",
      capabilities: [
        "text",
        "reasoning",
        "x_search",
        "web_search",
        "citations",
      ],
      fixedEndpointHost: "api.x.ai",
      secretLabel: "xAI API key",
    },
    {
      id: "openrouter",
      kind: "model",
      label: "OpenRouter",
      purposeFa:
        "مسیر یکپارچه و ممیزی‌پذیر برای fallback مدل‌ها؛ مدل رایگان فقط روی داده عمومی و بدون اثر خارجی مجاز است.",
      purposeEn:
        "Governed multi-model fallback routing; free models are restricted to public, no-effect workloads.",
      capabilities: [
        "text",
        "reasoning",
        "structured_output",
        "web_search",
        "citations",
        "model_routing",
        "usage_accounting",
      ],
      fixedEndpointHost: "openrouter.ai",
      secretLabel: "OpenRouter API key",
    },
    {
      id: "x_api",
      kind: "data_connector",
      label: "X API",
      purposeFa:
        "کانکتور داده عمومی X برای ingestion کنترل‌شده؛ این مورد مدل زبانی نیست.",
      purposeEn:
        "Controlled public-X ingestion connector; this is not a language model.",
      capabilities: ["public_x_search", "public_x_posts"],
      fixedEndpointHost: "api.x.com",
      secretLabel: "X API bearer token",
    },
  ]);

export const AI_AGENT_CATALOG: readonly AiAgentCatalogItem[] = Object.freeze([
  {
    id: "mentor_coach",
    labelFa: "مربی هوشمند کاربر",
    labelEn: "Learner mentor",
    responsibilityFa:
      "پاسخ آموزشی شخصی‌سازی‌شده با تاریخچه و حافظهٔ سروری همان کاربر و محتوای تأییدشده آکادمی.",
    responsibilityEn:
      "Personalized educational responses using that learner's server history, memory and approved Academy content.",
    allowedProviders: ["openai", "anthropic", "openrouter"],
    allowedTools: ["platform_knowledge"],
    readableScopes: [
      "academy.curriculum.approved.read",
      "academy.progress.own.read",
      "arena.signals.own.read",
      "mentor.history.own.read",
      "mentor.memory.own.read",
    ],
    forbiddenActions: [
      "financial_execution",
      "buy_sell_signal",
      "guaranteed_return",
      "secret_collection",
      "cross_user_access",
      "external_publish",
      "prompt_or_policy_mutation",
    ],
    approvalMode: "none",
    citationsRequired: false,
    mayReceivePrivateUserData: true,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: [
        "public",
        "approved_platform_content",
        "private_user",
      ],
      freeAllowed: false,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 2_000,
      dailyTokens: 4_000_000,
      maxInputTokens: 12_000,
      maxOutputTokens: 1_200,
      monthlyBudgetUsdMicros: 250_000_000,
    },
  },
  {
    id: "news_x_researcher",
    labelFa: "پژوهشگر خبر و X",
    labelEn: "News and X researcher",
    responsibilityFa:
      "یافتن ادعاها، روندها و گفت‌وگوهای عمومی X؛ خروجی فقط پیش‌نویس منبع‌دار است.",
    responsibilityEn:
      "Find public X claims, trends and conversations; output is a cited draft only.",
    allowedProviders: ["xai", "openrouter"],
    allowedTools: ["x_search", "web_search"],
    readableScopes: ["public.x.read", "public.web.read"],
    forbiddenActions: [
      "private_user_data",
      "direct_message",
      "account_action",
      "external_publish",
      "financial_execution",
      "knowledge_auto_verify",
    ],
    approvalMode: "before_publish",
    citationsRequired: true,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: ["public"],
      freeAllowed: true,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 300,
      dailyTokens: 1_500_000,
      maxInputTokens: 4_000,
      maxOutputTokens: 1_600,
      monthlyBudgetUsdMicros: 150_000_000,
    },
  },
  {
    id: "coin_tool_researcher",
    labelFa: "پژوهشگر کوین و ابزار",
    labelEn: "Coin and tool researcher",
    responsibilityFa:
      "مقایسهٔ ادعاهای عمومی درباره کوین‌ها و ابزارها با چند منبع؛ بدون رتبه‌بندی سرمایه‌گذاری.",
    responsibilityEn:
      "Cross-check public claims about assets and tools across sources without investment ranking.",
    allowedProviders: ["perplexity", "openai", "openrouter"],
    allowedTools: ["web_search"],
    readableScopes: [
      "public.web.read",
      "catalog.coins.read",
      "catalog.tools.read",
    ],
    forbiddenActions: [
      "private_user_data",
      "portfolio_recommendation",
      "buy_sell_signal",
      "external_publish",
      "financial_execution",
      "knowledge_auto_verify",
    ],
    approvalMode: "before_publish",
    citationsRequired: true,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: ["public"],
      freeAllowed: true,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 400,
      dailyTokens: 2_000_000,
      maxInputTokens: 5_000,
      maxOutputTokens: 1_800,
      monthlyBudgetUsdMicros: 180_000_000,
    },
  },
  {
    id: "content_reviewer",
    labelFa: "بازبین محتوا",
    labelEn: "Content reviewer",
    responsibilityFa:
      "بازبینی پیش‌نویس تأییدشده از نظر دقت، لحن، تناقض و ایمنی؛ بدون ویرایش یا انتشار مستقیم.",
    responsibilityEn:
      "Review an admitted draft for accuracy, tone, contradictions and safety without direct editing or publishing.",
    allowedProviders: ["anthropic", "openai", "openrouter"],
    allowedTools: [],
    readableScopes: [
      "content.drafts.admitted.read",
      "academy.style_guide.read",
    ],
    forbiddenActions: [
      "raw_user_messages",
      "external_publish",
      "content_mutation",
      "financial_execution",
      "knowledge_auto_verify",
    ],
    approvalMode: "before_publish",
    citationsRequired: false,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: ["public", "approved_platform_content"],
      freeAllowed: false,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 500,
      dailyTokens: 2_500_000,
      maxInputTokens: 12_000,
      maxOutputTokens: 2_000,
      monthlyBudgetUsdMicros: 160_000_000,
    },
  },
  {
    id: "executive_briefing",
    labelFa: "دستیار گزارش مدیریتی",
    labelEn: "Executive briefing assistant",
    responsibilityFa:
      "تبدیل شاخص‌های تجمیعی و بدون هویت به گزارش مدیریتی؛ نه خواندن متن خام کاربران.",
    responsibilityEn:
      "Turn de-identified aggregate metrics into executive briefs without reading raw user text.",
    allowedProviders: ["openai", "anthropic", "openrouter"],
    allowedTools: ["aggregate_metrics"],
    readableScopes: [
      "platform.metrics.aggregate.read",
      "operations.evidence.summary.read",
    ],
    forbiddenActions: [
      "raw_user_messages",
      "individual_user_profile",
      "external_publish",
      "platform_mutation",
      "financial_execution",
    ],
    approvalMode: "before_publish",
    citationsRequired: false,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: ["aggregate_deidentified"],
      freeAllowed: false,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 120,
      dailyTokens: 900_000,
      maxInputTokens: 10_000,
      maxOutputTokens: 2_400,
      monthlyBudgetUsdMicros: 90_000_000,
    },
  },
  {
    id: "knowledge_curator",
    labelFa: "متولی حافظهٔ دانش",
    labelEn: "Knowledge curator",
    responsibilityFa:
      "استخراج الگوهای تکرارشونده به‌صورت candidate همراه evidence؛ فقط انسان می‌تواند آن را verified کند.",
    responsibilityEn:
      "Create evidence-backed recurring-pattern candidates; only a human can mark them verified.",
    allowedProviders: ["openai", "anthropic", "openrouter"],
    allowedTools: ["platform_knowledge", "web_search"],
    readableScopes: [
      "knowledge.candidates.read",
      "operations.evidence.summary.read",
      "public.web.read",
    ],
    forbiddenActions: [
      "raw_secret_data",
      "raw_user_messages",
      "model_weight_mutation",
      "prompt_or_policy_mutation",
      "knowledge_auto_verify",
      "external_publish",
    ],
    approvalMode: "before_knowledge_promotion",
    citationsRequired: true,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: [
        "public",
        "aggregate_deidentified",
        "approved_platform_content",
      ],
      freeAllowed: false,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 100,
      dailyTokens: 800_000,
      maxInputTokens: 10_000,
      maxOutputTokens: 2_000,
      monthlyBudgetUsdMicros: 80_000_000,
    },
  },
  {
    id: "risk_compliance_reviewer",
    labelFa: "بازبین ریسک و انطباق",
    labelEn: "Risk and compliance reviewer",
    responsibilityFa:
      "علامت‌گذاری ادعاهای مالی، امنیتی یا بدون منبع قبل از انتشار یا ارتقای دانش.",
    responsibilityEn:
      "Flag financial, security-sensitive or unsupported claims before publication or knowledge promotion.",
    allowedProviders: ["anthropic", "openai", "openrouter"],
    allowedTools: [],
    readableScopes: [
      "content.drafts.admitted.read",
      "knowledge.candidates.read",
      "policy.ai.read",
    ],
    forbiddenActions: [
      "raw_user_messages",
      "policy_mutation",
      "external_publish",
      "knowledge_auto_verify",
      "financial_execution",
    ],
    approvalMode: "before_external_effect",
    citationsRequired: false,
    mayReceivePrivateUserData: false,
    mayPublish: false,
    openRouterFallback: {
      allowedDataClasses: [
        "public",
        "aggregate_deidentified",
        "approved_platform_content",
        "restricted_admin",
      ],
      freeAllowed: false,
      requireZeroDataRetention: true,
      denyProviderDataCollection: true,
    },
    defaultLimits: {
      dailyRequests: 300,
      dailyTokens: 1_400_000,
      maxInputTokens: 10_000,
      maxOutputTokens: 1_600,
      monthlyBudgetUsdMicros: 120_000_000,
    },
  },
]);

export const AI_WORKFLOW_CATALOG = Object.freeze([
  {
    id: "mentor_response",
    labelFa: "پاسخ مربی",
    labelEn: "Mentor response",
    stages: [
      "server_context_retrieval",
      "secret_and_injection_guard",
      "mentor_coach",
      "output_safety_guard",
      "thread_persistence_and_evidence",
    ],
    externalEffect: "none",
  },
  {
    id: "mentor_public_research",
    labelFa: "پژوهش عمومی منتور",
    labelEn: "Mentor public research",
    stages: [
      "public_query_guard",
      "private_context_exclusion",
      "public_research_agent",
      "citation_and_output_safety_guard",
      "thread_persistence_and_evidence",
    ],
    externalEffect: "none",
  },
  {
    id: "news_x_intelligence",
    labelFa: "هوشمندی خبر و X",
    labelEn: "News and X intelligence",
    stages: [
      "news_x_researcher",
      "coin_tool_researcher",
      "content_reviewer",
      "risk_compliance_reviewer",
      "human_publish_review",
    ],
    externalEffect: "human_only",
  },
  {
    id: "coin_tool_research",
    labelFa: "پرونده پژوهش کوین و ابزار",
    labelEn: "Coin and tool research dossier",
    stages: [
      "coin_tool_researcher",
      "content_reviewer",
      "risk_compliance_reviewer",
      "human_publish_review",
    ],
    externalEffect: "human_only",
  },
  {
    id: "governed_pattern_learning",
    labelFa: "یادگیری کنترل‌شده الگو",
    labelEn: "Governed pattern learning",
    stages: [
      "deidentified_pattern_detection",
      "knowledge_curator",
      "risk_compliance_reviewer",
      "human_knowledge_promotion",
      "retrieval_index",
    ],
    externalEffect: "human_only",
  },
] as const);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDER_IDS.includes(value as AiProviderId);
}

export function isAiModelProviderId(
  value: unknown,
): value is AiModelProviderId {
  return isAiProviderId(value) && value !== "x_api";
}

export function isAiAgentId(value: unknown): value is AiAgentId {
  return AI_AGENT_IDS.includes(value as AiAgentId);
}

export function aiAgentDefinition(agentId: AiAgentId): AiAgentCatalogItem {
  const agent = AI_AGENT_CATALOG.find((item) => item.id === agentId);
  if (!agent) throw new Error(`ai_agent_catalog_missing:${agentId}`);
  return agent;
}

export function assertAiAgentProviderAllowed(
  agentId: AiAgentId,
  providerId: AiModelProviderId,
): void {
  if (!aiAgentDefinition(agentId).allowedProviders.includes(providerId)) {
    throw new Error(`ai_agent_provider_forbidden:${agentId}:${providerId}`);
  }
}

export function aiToolsForAgent(
  agentId: AiAgentId,
  providerId: AiModelProviderId,
): readonly string[] {
  assertAiAgentProviderAllowed(agentId, providerId);
  const allowed = aiAgentDefinition(agentId).allowedTools;
  if (providerId === "xai")
    return allowed.filter(
      (tool) => tool === "x_search" || tool === "web_search",
    );
  if (providerId === "perplexity")
    return allowed.includes("web_search") ? ["web_search"] : [];
  if (providerId === "openai")
    return allowed.filter((tool) => tool === "web_search");
  if (providerId === "anthropic")
    return allowed.filter((tool) => tool === "web_search");
  if (providerId === "openrouter")
    return allowed.some(
      (tool) => tool === "web_search" || tool === "x_search",
    )
      ? ["web_search"]
      : [];
  return [];
}

export function validateAiCatalog(): void {
  const providerIds = new Set(
    AI_PROVIDER_CATALOG.map((provider) => provider.id),
  );
  const agentIds = new Set<string>();
  for (const agent of AI_AGENT_CATALOG) {
    if (agentIds.has(agent.id))
      throw new Error(`ai_agent_catalog_duplicate:${agent.id}`);
    agentIds.add(agent.id);
    if (agent.mayPublish !== false)
      throw new Error(`ai_agent_publish_authority_forbidden:${agent.id}`);
    if (agent.allowedProviders.length === 0)
      throw new Error(`ai_agent_provider_empty:${agent.id}`);
    for (const providerId of agent.allowedProviders) {
      if (!providerIds.has(providerId))
        throw new Error(`ai_agent_provider_missing:${agent.id}:${providerId}`);
    }
    if (agent.id !== "mentor_coach" && agent.mayReceivePrivateUserData) {
      throw new Error(`ai_agent_private_data_forbidden:${agent.id}`);
    }
    if (
      agent.openRouterFallback.freeAllowed &&
      (agent.openRouterFallback.allowedDataClasses.length !== 1 ||
        agent.openRouterFallback.allowedDataClasses[0] !== "public")
    ) {
      throw new Error(`ai_agent_free_fallback_scope_invalid:${agent.id}`);
    }
    if (
      !agent.openRouterFallback.requireZeroDataRetention ||
      !agent.openRouterFallback.denyProviderDataCollection
    ) {
      throw new Error(`ai_agent_openrouter_privacy_guard_missing:${agent.id}`);
    }
    if (
      agent.id === "knowledge_curator" &&
      agent.approvalMode !== "before_knowledge_promotion"
    ) {
      throw new Error("ai_knowledge_curator_human_gate_missing");
    }
    for (const value of Object.values(agent.defaultLimits)) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`ai_agent_limit_invalid:${agent.id}`);
    }
  }
}

validateAiCatalog();
