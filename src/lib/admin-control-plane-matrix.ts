import { getAllFlags, type FeatureFlag } from "./feature-flags";

export type AdminControlPlaneGroup =
  | "identity"
  | "academy"
  | "trading"
  | "money_movement"
  | "growth"
  | "community"
  | "operations";

export type AdminControlPlaneModuleId =
  | "auth_identity"
  | "academy_operations"
  | "trading_arena"
  | "real_exchange"
  | "wallet_custody"
  | "withdrawals_settlement"
  | "risk_compliance"
  | "notifications_campaigns"
  | "ai_mentor"
  | "community_reputation"
  | "crm_leads"
  | "future_marketplace"
  | "data_growth_automation"
  | "observability_audit";

export type AdminControlPlaneStatus =
  | "live"
  | "configured"
  | "launch_locked"
  | "feature_locked"
  | "needs_evidence"
  | "planned";

export type AdminConnectionStatus = "internal" | "connected" | "locked" | "needs_secret" | "planned";
export type AdminControlRiskLevel = "standard" | "sensitive" | "critical";

export type AdminControlPlaneConnection = {
  id: string;
  labelFa: string;
  labelEn: string;
  kind: "database" | "identity" | "market_data" | "custody" | "messaging" | "ai" | "analytics" | "compliance" | "integration";
  status: AdminConnectionStatus;
  lockedReasonFa?: string;
  lockedReasonEn?: string;
};

export type AdminControlPlaneControl = {
  id: string;
  labelFa: string;
  labelEn: string;
  surfaceFa: string;
  surfaceEn: string;
  status: AdminControlPlaneStatus;
  requiredPermission: string;
  stepUpRequired: boolean;
  lockedReasonFa?: string;
  lockedReasonEn?: string;
};

export type AdminControlPlaneModule = {
  id: AdminControlPlaneModuleId;
  group: AdminControlPlaneGroup;
  labelFa: string;
  labelEn: string;
  descriptionFa: string;
  descriptionEn: string;
  status: AdminControlPlaneStatus;
  riskLevel: AdminControlRiskLevel;
  adminRoute: string;
  apiRoutes: string[];
  requiredPermission: string;
  stepUpRequired: boolean;
  gatedBy: FeatureFlag[];
  connections: AdminControlPlaneConnection[];
  controls: AdminControlPlaneControl[];
  evidenceChecklistFa: string[];
  evidenceChecklistEn: string[];
};

export type AdminControlPlaneSnapshot = {
  generatedAt: string;
  featureFlags: Record<FeatureFlag, boolean>;
  summary: {
    totalModules: number;
    liveModules: number;
    lockedModules: number;
    criticalModules: number;
    managedControls: number;
    managedConnections: number;
    lockedConnections: number;
  };
  modules: AdminControlPlaneModule[];
  safetyCopyFa: string;
  safetyCopyEn: string;
};

function flagLocked(flags: Record<FeatureFlag, boolean>, flag: FeatureFlag, enabledStatus: AdminControlPlaneStatus): AdminControlPlaneStatus {
  return flags[flag] ? enabledStatus : "feature_locked";
}

function exchangeLaunchStatus(flags: Record<FeatureFlag, boolean>): AdminControlPlaneStatus {
  return flags["exchange.enabled"] ? "needs_evidence" : "launch_locked";
}

function realMoneyLockedReasonFa(flags: Record<FeatureFlag, boolean>): string {
  return flags["exchange.enabled"]
    ? "نیازمند تکمیل evidence عملیاتی، custody، reconciliation و sign-off پیش از اثر مالی واقعی."
    : "صرافی اختصاصی/پیشرفته تک‌پی در حال توسعه است و تا فعال شدن launch gate قفل می‌ماند.";
}

function realMoneyLockedReasonEn(flags: Record<FeatureFlag, boolean>): string {
  return flags["exchange.enabled"]
    ? "Requires operational, custody, reconciliation and sign-off evidence before real financial effects."
    : "TecPey's dedicated advanced exchange is in development and remains locked until the launch gate is enabled.";
}

export function resolveAdminControlPlaneMatrix(input: {
  now?: Date;
  featureFlags?: Record<FeatureFlag, boolean>;
} = {}): AdminControlPlaneSnapshot {
  const featureFlags = input.featureFlags ?? getAllFlags();
  const exchangeStatus = exchangeLaunchStatus(featureFlags);
  const exchangeLockFa = realMoneyLockedReasonFa(featureFlags);
  const exchangeLockEn = realMoneyLockedReasonEn(featureFlags);
  const socialStatus = flagLocked(featureFlags, "social.enabled", "needs_evidence");
  const marketplaceStatus = flagLocked(featureFlags, "future.marketplace.enabled", "planned");

  const modules: AdminControlPlaneModule[] = [
    {
      id: "auth_identity",
      group: "identity",
      labelFa: "هویت، Passkey و Providerهای ورود",
      labelEn: "Identity, passkeys and sign-in providers",
      descriptionFa: "کنترل Session ادمین، نقش‌ها، Step-up و مسیرهای Google/Apple/Telegram/Email OTP از یک سطح مدیریتی.",
      descriptionEn: "Controls admin sessions, roles, step-up and Google/Apple/Telegram/Email OTP sign-in surfaces from one admin plane.",
      status: "configured",
      riskLevel: "critical",
      adminRoute: "/command-center/auth-providers",
      apiRoutes: ["/api/command-center/auth/*", "/api/command-center/auth-providers"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: true,
      gatedBy: ["social.enabled"],
      connections: [
        { id: "postgres_admin_sessions", labelFa: "PostgreSQL Admin Sessions", labelEn: "PostgreSQL admin sessions", kind: "database", status: "internal" },
        { id: "webauthn_passkey", labelFa: "WebAuthn / Passkey", labelEn: "WebAuthn / passkey", kind: "identity", status: "connected" },
        {
          id: "oauth_google_apple",
          labelFa: "Google و Apple OAuth",
          labelEn: "Google and Apple OAuth",
          kind: "identity",
          status: featureFlags["social.enabled"] ? "needs_secret" : "locked",
          lockedReasonFa: "فعال‌سازی نیازمند Secret سمت سرور، callback allowlist، domain verification و policy اتصال حساب است.",
          lockedReasonEn: "Activation requires server-side secrets, callback allowlists, domain verification and account-linking policy.",
        },
      ],
      controls: [
        { id: "admin_session_revocation", labelFa: "ابطال Session ادمین", labelEn: "Admin session revocation", surfaceFa: "Command Center Auth", surfaceEn: "Command Center Auth", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "provider_enable_review", labelFa: "درخواست فعال‌سازی Provider", labelEn: "Provider enable review", surfaceFa: "Auth Provider Control", surfaceEn: "Auth Provider Control", status: socialStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: "بدون evidence کامل فقط درخواست review پذیرفته می‌شود.", lockedReasonEn: "Without complete evidence only review requests are accepted." },
        { id: "account_linking_policy", labelFa: "Policy اتصال حساب", labelEn: "Account-linking policy", surfaceFa: "Auth Provider Control", surfaceEn: "Auth Provider Control", status: socialStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Passkey verified", "Role/permission نسخه‌بندی شده", "Step-up برای تغییر حساس", "OAuth evidence کامل پیش از enable"],
      evidenceChecklistEn: ["Passkey verified", "Versioned roles/permissions", "Step-up for sensitive changes", "Complete OAuth evidence before enable"],
    },
    {
      id: "academy_operations",
      group: "academy",
      labelFa: "عملیات آکادمی",
      labelEn: "Academy operations",
      descriptionFa: "کاربران، پیشرفت آموزشی، مدارک، فصل‌های mastery و پیام‌های عملیاتی آکادمی.",
      descriptionEn: "Users, learning progress, certificates, mastery seasons and Academy operational messages.",
      status: flagLocked(featureFlags, "academy.enabled", "live"),
      riskLevel: "sensitive",
      adminRoute: "/command-center",
      apiRoutes: ["/api/command-center/summary", "/api/academy/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: ["academy.enabled"],
      connections: [
        { id: "learning_events", labelFa: "Learning Events", labelEn: "Learning events", kind: "database", status: "internal" },
        { id: "academy_progress", labelFa: "Academy Progress Store", labelEn: "Academy progress store", kind: "database", status: "internal" },
      ],
      controls: [
        { id: "student_progress_read", labelFa: "مشاهده پیشرفت کاربران", labelEn: "Read student progress", surfaceFa: "Command Center Summary", surfaceEn: "Command Center Summary", status: "live", requiredPermission: "admin.roles.read", stepUpRequired: false },
        { id: "certificate_audit", labelFa: "ممیزی مدارک", labelEn: "Certificate audit", surfaceFa: "Academy Authority", surfaceEn: "Academy Authority", status: "configured", requiredPermission: "admin.roles.read", stepUpRequired: false },
        { id: "mastery_season_control", labelFa: "کنترل فصل‌های mastery", labelEn: "Mastery season control", surfaceFa: "Academy Operations", surfaceEn: "Academy Operations", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: "Mentor فقط draft/recommend می‌کند؛ publish نیازمند approval تاییدشده C-level/compliance است.", lockedReasonEn: "Mentor may only draft/recommend; publishing requires approved C-level/compliance control evidence." },
      ],
      evidenceChecklistFa: ["Tenant isolation", "Learning event source boundary", "Certificate backfill evidence", "C-level approval برای publish فصل‌های generated"],
      evidenceChecklistEn: ["Tenant isolation", "Learning event source boundary", "Certificate backfill evidence", "C-level approval for generated-season publishing"],
    },
    {
      id: "trading_arena",
      group: "trading",
      labelFa: "Trading Arena و حساب تمرینی",
      labelEn: "Trading Arena and paper account",
      descriptionFa: "محیط تمرینی با موجودی غیرواقعی، چارت پیشرفته، ابزارها، استراتژی و bridge آماده برای switch آینده.",
      descriptionEn: "Paper-money arena with advanced charts, tools, strategies and a bridge prepared for a future account switch.",
      status: "configured",
      riskLevel: "sensitive",
      adminRoute: "/command-center/control-plane#trading",
      apiRoutes: ["/api/trading/*", "/api/exchange/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: [],
      connections: [
        { id: "paper_ledger", labelFa: "Paper Ledger", labelEn: "Paper ledger", kind: "database", status: "internal" },
        { id: "chart_market_feed", labelFa: "Market/Chart Feed", labelEn: "Market/chart feed", kind: "market_data", status: "planned", lockedReasonFa: "اتصال نهایی feed باید با latency، fallback و audit بررسی شود.", lockedReasonEn: "Final feed connection needs latency, fallback and audit review." },
      ],
      controls: [
        { id: "arena_account_mode", labelFa: "Switch حساب Arena/Real", labelEn: "Arena/real account switch", surfaceFa: "Trading Arena Header", surfaceEn: "Trading Arena Header", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "paper_balance_policy", labelFa: "سیاست موجودی تمرینی", labelEn: "Paper balance policy", surfaceFa: "Arena Admin", surfaceEn: "Arena Admin", status: "planned", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "indicator_toolkit", labelFa: "ابزارها و اندیکاتورهای چارت", labelEn: "Chart tools and indicators", surfaceFa: "Trading View", surfaceEn: "Trading View", status: "configured", requiredPermission: "admin.roles.read", stepUpRequired: false },
      ],
      evidenceChecklistFa: ["تفکیک واضح حساب تمرینی و واقعی", "قفل UX روی real switch", "عدم اثر مالی از Arena"],
      evidenceChecklistEn: ["Clear paper/real separation", "Locked UX on real switch", "No financial effects from Arena"],
    },
    {
      id: "real_exchange",
      group: "money_movement",
      labelFa: "صرافی اختصاصی/پیشرفته تک‌پی",
      labelEn: "TecPey dedicated advanced exchange",
      descriptionFa: "مسیر صرافی واقعی با موجودی واقعی فقط پس از تکمیل launch evidence، order authority و کنترل‌های تسویه باز می‌شود.",
      descriptionEn: "The real exchange path with real balances opens only after launch evidence, order authority and settlement controls are complete.",
      status: exchangeStatus,
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#money_movement",
      apiRoutes: ["/api/exchange/*"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: ["exchange.enabled"],
      connections: [
        { id: "order_admission", labelFa: "Order Admission Authority", labelEn: "Order admission authority", kind: "database", status: "locked", lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "matching_engine", labelFa: "Matching Engine", labelEn: "Matching engine", kind: "integration", status: "planned", lockedReasonFa: "نیازمند تست deterministic، replay و reconciliation است.", lockedReasonEn: "Requires deterministic, replay and reconciliation tests." },
        { id: "real_balance_ledger", labelFa: "Real Balance Ledger", labelEn: "Real balance ledger", kind: "database", status: "locked", lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
      ],
      controls: [
        { id: "real_exchange_launch_gate", labelFa: "Launch gate صرافی واقعی", labelEn: "Real exchange launch gate", surfaceFa: "Control Plane Matrix", surfaceEn: "Control Plane Matrix", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "real_order_enable", labelFa: "فعال‌سازی سفارش واقعی", labelEn: "Enable real orders", surfaceFa: "Exchange Admin", surfaceEn: "Exchange Admin", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "real_balance_visibility", labelFa: "نمایش موجودی واقعی", labelEn: "Real balance visibility", surfaceFa: "Account Switcher", surfaceEn: "Account Switcher", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
      ],
      evidenceChecklistFa: ["Order admission tests", "Reconciliation evidence", "Exact-head workflow evidence", "Go approval matrix", "Rollback/incident readiness"],
      evidenceChecklistEn: ["Order admission tests", "Reconciliation evidence", "Exact-head workflow evidence", "Go approval matrix", "Rollback/incident readiness"],
    },
    {
      id: "wallet_custody",
      group: "money_movement",
      labelFa: "Wallet، Custody و Deposit",
      labelEn: "Wallet, custody and deposits",
      descriptionFa: "کلیدها، آدرس‌های واریز، custody provider و سیاست hot/cold پیش از هر دارایی واقعی قفل هستند.",
      descriptionEn: "Keys, deposit addresses, custody providers and hot/cold policy remain locked before any real assets.",
      status: exchangeStatus,
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#money_movement",
      apiRoutes: ["/api/wallet/*"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: ["exchange.enabled"],
      connections: [
        { id: "custody_provider", labelFa: "Custody Provider", labelEn: "Custody provider", kind: "custody", status: "locked", lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "keystore_runtime", labelFa: "Keystore Runtime Guard", labelEn: "Keystore runtime guard", kind: "custody", status: "locked", lockedReasonFa: "نیازمند secret isolation، rotation و emergency revoke evidence.", lockedReasonEn: "Requires secret isolation, rotation and emergency revoke evidence." },
      ],
      controls: [
        { id: "deposit_address_enable", labelFa: "فعال‌سازی آدرس واریز", labelEn: "Enable deposit addresses", surfaceFa: "Wallet Admin", surfaceEn: "Wallet Admin", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "custody_policy", labelFa: "سیاست Custody", labelEn: "Custody policy", surfaceFa: "Wallet Admin", surfaceEn: "Wallet Admin", status: "needs_evidence", requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: "تا تکمیل سند custody و تست recovery قابل enable نیست.", lockedReasonEn: "Cannot be enabled until custody policy and recovery tests are complete." },
      ],
      evidenceChecklistFa: ["Custody launch gate", "Keystore runtime guard", "Recovery drill", "Accepted risk sign-off"],
      evidenceChecklistEn: ["Custody launch gate", "Keystore runtime guard", "Recovery drill", "Accepted risk sign-off"],
    },
    {
      id: "withdrawals_settlement",
      group: "money_movement",
      labelFa: "برداشت، Settlement و Reconciliation",
      labelEn: "Withdrawals, settlement and reconciliation",
      descriptionFa: "برداشت واقعی، pre-broadcast evidence، اثر خارجی و reconciliation تا تکمیل gateهای مالی قفل می‌مانند.",
      descriptionEn: "Real withdrawals, pre-broadcast evidence, external effects and reconciliation stay locked until money-movement gates pass.",
      status: exchangeStatus,
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#money_movement",
      apiRoutes: ["/api/withdrawals/*", "/api/exchange/reconcile"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: ["exchange.enabled"],
      connections: [
        { id: "withdrawal_admission", labelFa: "Withdrawal Admission", labelEn: "Withdrawal admission", kind: "database", status: "locked", lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "settlement_reconciliation", labelFa: "Settlement Reconciliation", labelEn: "Settlement reconciliation", kind: "database", status: "locked", lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
      ],
      controls: [
        { id: "withdrawal_enable", labelFa: "فعال‌سازی برداشت واقعی", labelEn: "Enable real withdrawals", surfaceFa: "Withdrawal Admin", surfaceEn: "Withdrawal Admin", status: exchangeStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: exchangeLockFa, lockedReasonEn: exchangeLockEn },
        { id: "prebroadcast_review", labelFa: "بازبینی pre-broadcast", labelEn: "Pre-broadcast review", surfaceFa: "Withdrawal Admin", surfaceEn: "Withdrawal Admin", status: "needs_evidence", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Pre-broadcast evidence", "External-effect confirmation", "Race/replay tests", "Settlement reconciliation"],
      evidenceChecklistEn: ["Pre-broadcast evidence", "External-effect confirmation", "Race/replay tests", "Settlement reconciliation"],
    },
    {
      id: "risk_compliance",
      group: "operations",
      labelFa: "Risk، Compliance و Launch Decision",
      labelEn: "Risk, compliance and launch decision",
      descriptionFa: "حدود ریسک، compliance hooks، launch packet، accepted risk و go/no-go matrix از پنل ادمین قابل رصد می‌شوند.",
      descriptionEn: "Risk limits, compliance hooks, launch packets, accepted risk and go/no-go matrix are visible from admin.",
      status: "configured",
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#operations",
      apiRoutes: ["/api/risk/*", "/api/launch/*"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: [],
      connections: [
        { id: "risk_engine", labelFa: "Risk Enforcement", labelEn: "Risk enforcement", kind: "compliance", status: "internal" },
        { id: "launch_evidence_manifest", labelFa: "Launch Evidence Manifest", labelEn: "Launch evidence manifest", kind: "compliance", status: "internal" },
      ],
      controls: [
        { id: "accepted_risk_signoff", labelFa: "Accepted risk sign-off", labelEn: "Accepted risk sign-off", surfaceFa: "Launch Control", surfaceEn: "Launch Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "go_approval_matrix", labelFa: "Go approval matrix", labelEn: "Go approval matrix", surfaceFa: "Launch Control", surfaceEn: "Launch Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Risk enforcement authority", "Launch decision checks", "Accepted-risk evidence", "Incident readiness evidence"],
      evidenceChecklistEn: ["Risk enforcement authority", "Launch decision checks", "Accepted-risk evidence", "Incident readiness evidence"],
    },
    {
      id: "notifications_campaigns",
      group: "growth",
      labelFa: "اعلان‌ها و Campaign",
      labelEn: "Notifications and campaigns",
      descriptionFa: "کمپین بازگشت کاربر، اعلان‌های عملیاتی، templates، rate limit و audit تولید پیام.",
      descriptionEn: "User return campaigns, operational alerts, templates, rate limits and message-production audit.",
      status: "configured",
      riskLevel: "sensitive",
      adminRoute: "/command-center/communications",
      apiRoutes: ["/api/command-center/campaign", "/api/command-center/communications", "/api/notifications/*"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: [],
      connections: [
        { id: "notification_outbox", labelFa: "Notification Outbox", labelEn: "Notification outbox", kind: "messaging", status: "internal" },
        { id: "transactional_delivery", labelFa: "SMS و Email Providers", labelEn: "SMS and email providers", kind: "messaging", status: "needs_secret", lockedReasonFa: "فعال‌سازی هر Provider نیازمند Secret رمز‌شده، Step-up و تست اتصال است.", lockedReasonEn: "Each provider requires an encrypted secret, step-up and a connection test before activation." },
      ],
      controls: [
        { id: "return_campaign", labelFa: "ثبت کمپین بازگشت", labelEn: "Create return campaign", surfaceFa: "Command Center", surfaceEn: "Command Center", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "communication_provider_config", labelFa: "تنظیم SMS، ایمیل و Template", labelEn: "Configure SMS, email and templates", surfaceFa: "Communication Providers", surfaceEn: "Communication Providers", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "delivery_rate_limits", labelFa: "Rate limit ارسال", labelEn: "Delivery rate limits", surfaceFa: "Messaging Admin", surfaceEn: "Messaging Admin", status: "planned", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Notification persistence", "Producer boundary", "Sensitive mutation audit"],
      evidenceChecklistEn: ["Notification persistence", "Producer boundary", "Sensitive mutation audit"],
    },
    {
      id: "ai_mentor",
      group: "academy",
      labelFa: "AI Mentor و Trust Boundary",
      labelEn: "AI mentor and trust boundary",
      descriptionFa: "تنظیمات mentor، provider، preference، سیاست ایمنی و جداسازی خروجی آموزشی از توصیه مالی.",
      descriptionEn: "Mentor provider, preferences, safety policy and separation of education from financial advice.",
      status: flagLocked(featureFlags, "mentor.enabled", "configured"),
      riskLevel: "sensitive",
      adminRoute: "/command-center/control-plane#academy",
      apiRoutes: ["/api/mentor/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: ["mentor.enabled"],
      connections: [
        { id: "mentor_provider", labelFa: "AI Mentor Provider", labelEn: "AI mentor provider", kind: "ai", status: featureFlags["mentor.enabled"] ? "connected" : "locked" },
        { id: "mentor_preference_store", labelFa: "Preference Store", labelEn: "Preference store", kind: "database", status: "internal" },
      ],
      controls: [
        { id: "mentor_policy", labelFa: "سیاست پاسخ mentor", labelEn: "Mentor response policy", surfaceFa: "AI Trust Control", surfaceEn: "AI Trust Control", status: flagLocked(featureFlags, "mentor.enabled", "configured"), requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "financial_advice_boundary", labelFa: "مرز توصیه مالی", labelEn: "Financial advice boundary", surfaceFa: "AI Trust Control", surfaceEn: "AI Trust Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Provider trust boundary", "Preference authority", "No financial-advice guarantee"],
      evidenceChecklistEn: ["Provider trust boundary", "Preference authority", "No financial-advice guarantee"],
    },
    {
      id: "community_reputation",
      group: "community",
      labelFa: "Community، Reputation و Challenge",
      labelEn: "Community, reputation and challenges",
      descriptionFa: "Journal، challenge، discipline score، consent و reputation evidence با tenant isolation.",
      descriptionEn: "Journal, challenges, discipline score, consent and reputation evidence with tenant isolation.",
      status: "configured",
      riskLevel: "sensitive",
      adminRoute: "/command-center/control-plane#community",
      apiRoutes: ["/api/community/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: [],
      connections: [
        { id: "community_journal", labelFa: "Community Journal", labelEn: "Community journal", kind: "database", status: "internal" },
        { id: "reputation_scoring", labelFa: "Reputation Scoring", labelEn: "Reputation scoring", kind: "analytics", status: "internal" },
      ],
      controls: [
        { id: "challenge_finalization", labelFa: "نهایی‌سازی Challenge", labelEn: "Challenge finalization", surfaceFa: "Community Ops", surfaceEn: "Community Ops", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "consent_policy", labelFa: "Consent policy", labelEn: "Consent policy", surfaceFa: "Community Ops", surfaceEn: "Community Ops", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Consent enforcement", "Journal redaction", "Reputation evidence", "Challenge scheduler evidence"],
      evidenceChecklistEn: ["Consent enforcement", "Journal redaction", "Reputation evidence", "Challenge scheduler evidence"],
    },
    {
      id: "crm_leads",
      group: "growth",
      labelFa: "CRM، Lead و Retention",
      labelEn: "CRM, leads and retention",
      descriptionFa: "Lead capture، retention، delivery worker و campaign attribution برای رشد کنترل‌شده.",
      descriptionEn: "Lead capture, retention, delivery workers and campaign attribution for controlled growth.",
      status: "configured",
      riskLevel: "sensitive",
      adminRoute: "/command-center/control-plane#growth",
      apiRoutes: ["/api/crm/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: [],
      connections: [
        { id: "crm_lead_store", labelFa: "CRM Lead Store", labelEn: "CRM lead store", kind: "database", status: "internal" },
        { id: "retention_worker", labelFa: "Retention Worker", labelEn: "Retention worker", kind: "analytics", status: "internal" },
      ],
      controls: [
        { id: "lead_retention_policy", labelFa: "سیاست retention lead", labelEn: "Lead retention policy", surfaceFa: "CRM Ops", surfaceEn: "CRM Ops", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "lead_delivery_worker", labelFa: "Delivery worker", labelEn: "Delivery worker", surfaceFa: "CRM Ops", surfaceEn: "CRM Ops", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["CRM lead authority", "Retention policy", "Delivery worker audit"],
      evidenceChecklistEn: ["CRM lead authority", "Retention policy", "Delivery worker audit"],
    },
    {
      id: "future_marketplace",
      group: "growth",
      labelFa: "Marketplace آینده",
      labelEn: "Future marketplace",
      descriptionFa: "فروشنده، محصول، settlement و entitlement تا فعال شدن feature flag و evidence مالی قفل می‌ماند.",
      descriptionEn: "Vendors, products, settlement and entitlements stay locked until feature flag and financial evidence pass.",
      status: marketplaceStatus,
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#growth",
      apiRoutes: ["/api/marketplace/*"],
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      gatedBy: ["future.marketplace.enabled"],
      connections: [
        { id: "marketplace_vendor_store", labelFa: "Vendor Store", labelEn: "Vendor store", kind: "database", status: featureFlags["future.marketplace.enabled"] ? "planned" : "locked", lockedReasonFa: "Marketplace تا feature flag و evidence تسویه قفل است.", lockedReasonEn: "Marketplace is locked until its feature flag and settlement evidence are ready." },
      ],
      controls: [
        { id: "vendor_enable", labelFa: "فعال‌سازی فروشنده", labelEn: "Enable vendors", surfaceFa: "Marketplace Admin", surfaceEn: "Marketplace Admin", status: marketplaceStatus, requiredPermission: "admin.roles.manage", stepUpRequired: true, lockedReasonFa: "نیازمند feature flag و settlement evidence.", lockedReasonEn: "Requires feature flag and settlement evidence." },
      ],
      evidenceChecklistFa: ["Vendor identity", "Settlement evidence", "Entitlement isolation"],
      evidenceChecklistEn: ["Vendor identity", "Settlement evidence", "Entitlement isolation"],
    },
    {
      id: "data_growth_automation",
      group: "operations",
      labelFa: "Data، News و Growth Automation",
      labelEn: "Data, news and growth automation",
      descriptionFa: "Materialization سکه‌ها، ابزارها، news، scheduler evidence و cache policy برای داده‌های عمومی.",
      descriptionEn: "Coin/tool/news materialization, scheduler evidence and cache policy for public data.",
      status: "configured",
      riskLevel: "standard",
      adminRoute: "/command-center/control-plane#operations",
      apiRoutes: ["/api/news/*", "/api/coins/*", "/api/tools/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      gatedBy: [],
      connections: [
        { id: "news_materialization", labelFa: "News Materialization", labelEn: "News materialization", kind: "analytics", status: "internal" },
        { id: "growth_materialization", labelFa: "Growth Materialization", labelEn: "Growth materialization", kind: "analytics", status: "internal" },
      ],
      controls: [
        { id: "materialization_health", labelFa: "سلامت materialization", labelEn: "Materialization health", surfaceFa: "Ops Control", surfaceEn: "Ops Control", status: "configured", requiredPermission: "admin.roles.read", stepUpRequired: false },
        { id: "public_cache_policy", labelFa: "Cache policy عمومی", labelEn: "Public cache policy", surfaceFa: "Ops Control", surfaceEn: "Ops Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Last-run evidence", "Source boundary", "Cache-control policy"],
      evidenceChecklistEn: ["Last-run evidence", "Source boundary", "Cache-control policy"],
    },
    {
      id: "observability_audit",
      group: "operations",
      labelFa: "Observability، Audit و Incident Readiness",
      labelEn: "Observability, audit and incident readiness",
      descriptionFa: "Audit حساس، incident readiness، rollback evidence، health check و operational recovery.",
      descriptionEn: "Sensitive audit, incident readiness, rollback evidence, health checks and operational recovery.",
      status: "configured",
      riskLevel: "critical",
      adminRoute: "/command-center/control-plane#operations",
      apiRoutes: ["/api/health", "/api/audit/*"],
      requiredPermission: "admin.roles.read",
      stepUpRequired: true,
      gatedBy: [],
      connections: [
        { id: "sensitive_audit", labelFa: "Sensitive Mutation Audit", labelEn: "Sensitive mutation audit", kind: "database", status: "internal" },
        { id: "incident_evidence", labelFa: "Incident Evidence Store", labelEn: "Incident evidence store", kind: "compliance", status: "internal" },
      ],
      controls: [
        { id: "incident_readiness", labelFa: "Incident readiness", labelEn: "Incident readiness", surfaceFa: "Ops Control", surfaceEn: "Ops Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
        { id: "rollback_evidence", labelFa: "Rollback evidence", labelEn: "Rollback evidence", surfaceFa: "Ops Control", surfaceEn: "Ops Control", status: "configured", requiredPermission: "admin.roles.manage", stepUpRequired: true },
      ],
      evidenceChecklistFa: ["Sensitive mutation audit", "Operational recovery", "Rollback volume restore", "Exact-head workflow evidence"],
      evidenceChecklistEn: ["Sensitive mutation audit", "Operational recovery", "Rollback volume restore", "Exact-head workflow evidence"],
    },
  ];

  const managedConnections = modules.flatMap((module) => module.connections);
  const managedControls = modules.flatMap((module) => module.controls);

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    featureFlags,
    summary: {
      totalModules: modules.length,
      liveModules: modules.filter((module) => module.status === "live" || module.status === "configured").length,
      lockedModules: modules.filter((module) => ["launch_locked", "feature_locked", "needs_evidence"].includes(module.status)).length,
      criticalModules: modules.filter((module) => module.riskLevel === "critical").length,
      managedControls: managedControls.length,
      managedConnections: managedConnections.length,
      lockedConnections: managedConnections.filter((connection) => ["locked", "needs_secret"].includes(connection.status)).length,
    },
    modules,
    safetyCopyFa: "هر اتصال یا تنظیم حساس باید از همین Control Plane قابل مشاهده باشد؛ enable واقعی فقط بعد از Permission، Step-up و evidence معتبر انجام می‌شود.",
    safetyCopyEn: "Every sensitive connection or setting must be visible from this control plane; real enablement requires permission, step-up and valid evidence.",
  };
}
