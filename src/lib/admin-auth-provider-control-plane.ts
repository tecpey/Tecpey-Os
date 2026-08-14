import { getAllFlags, type FeatureFlag } from "./feature-flags";

export type AuthProviderId = "passkey" | "google" | "apple" | "telegram" | "email_otp";
export type AuthProviderStatus = "configured" | "locked" | "planned" | "needs_evidence" | "disabled";
export type AuthProviderRiskLevel = "standard" | "sensitive" | "critical";
export type AuthProviderConfigStorage =
  | "admin_metadata"
  | "secret_store"
  | "callback_allowlist"
  | "domain_verification"
  | "policy";
export type AuthProviderConfigStatus = "configured" | "missing" | "managed" | "planned";
export type AuthProviderConfigFieldId =
  | "rp_id"
  | "client_id"
  | "client_secret_ref"
  | "redirect_uri"
  | "services_id"
  | "team_id"
  | "key_id"
  | "private_key_ref"
  | "domain_association"
  | "bot_id"
  | "bot_token_ref"
  | "email_sender_domain"
  | "email_provider_key_ref"
  | "rate_limit_policy"
  | "account_linking_policy_ref"
  | "audit_rotation_policy_ref";
export type AuthProviderAdminActionId =
  | "open_setup"
  | "verify_callback"
  | "rotate_secret"
  | "request_enable"
  | "request_disable";
export type AuthProviderEvidenceGateId =
  | "client_registered"
  | "redirect_uri_allowlisted"
  | "secret_stored_server_side"
  | "domain_verified"
  | "account_linking_policy"
  | "audit_rotation_policy";

export type AuthProviderEvidence = Partial<Record<AuthProviderEvidenceGateId, boolean>>;

export type AuthProviderGate = {
  id: AuthProviderEvidenceGateId;
  ready: boolean;
  labelFa: string;
  labelEn: string;
};

export type AuthProviderConfigField = {
  id: AuthProviderConfigFieldId;
  labelFa: string;
  labelEn: string;
  storage: AuthProviderConfigStorage;
  required: boolean;
  masked: boolean;
  status: AuthProviderConfigStatus;
  helperFa: string;
  helperEn: string;
};

export type AuthProviderControlAction = {
  id: AuthProviderAdminActionId;
  labelFa: string;
  labelEn: string;
  descriptionFa: string;
  descriptionEn: string;
  enabled: boolean;
  locked: boolean;
  requiredPermission: string;
  stepUpRequired: boolean;
  disabledReasonFa: string | null;
  disabledReasonEn: string | null;
};

export type AuthProviderControl = {
  id: AuthProviderId;
  labelFa: string;
  labelEn: string;
  providerFa: string;
  providerEn: string;
  descriptionFa: string;
  descriptionEn: string;
  status: AuthProviderStatus;
  riskLevel: AuthProviderRiskLevel;
  requiredPermission: string;
  stepUpRequired: boolean;
  adminLocked: boolean;
  callbackPath: string | null;
  gates: AuthProviderGate[];
  configurationFields: AuthProviderConfigField[];
  adminActions: AuthProviderControlAction[];
  readinessPercent: number;
  missingGateIds: AuthProviderEvidenceGateId[];
};

export type AuthProviderControlSnapshot = {
  generatedAt: string;
  featureFlags: Record<FeatureFlag, boolean>;
  summary: {
    totalProviders: number;
    configuredProviders: number;
    lockedProviders: number;
    criticalProviders: number;
    stepUpProviders: number;
  };
  providers: AuthProviderControl[];
  safetyCopyFa: string;
  safetyCopyEn: string;
};

export type AuthProviderUpdateInput = {
  providerId: AuthProviderId;
  requestedState: "enabled" | "disabled";
  evidence?: AuthProviderEvidence;
  featureFlags?: Record<FeatureFlag, boolean>;
};

export type AuthProviderUpdateDecision =
  | {
      ok: true;
      providerId: AuthProviderId;
      requestedState: "enabled" | "disabled";
      status: "accepted_for_review";
    }
  | {
      ok: false;
      providerId: AuthProviderId;
      requestedState: "enabled" | "disabled";
      error: "auth_provider_control_locked" | "auth_provider_read_only";
      httpStatus: 409 | 423;
      missingGateIds: AuthProviderEvidenceGateId[];
    };

const PROVIDER_IDS: AuthProviderId[] = ["passkey", "google", "apple", "telegram", "email_otp"];
const AUTH_PROVIDER_EVIDENCE_GATE_IDS: AuthProviderEvidenceGateId[] = [
  "client_registered",
  "redirect_uri_allowlisted",
  "secret_stored_server_side",
  "domain_verified",
  "account_linking_policy",
  "audit_rotation_policy",
];

type AuthProviderConfigFieldTemplate = Omit<AuthProviderConfigField, "status"> & {
  gateId?: AuthProviderEvidenceGateId;
};

export const AUTH_PROVIDER_EVIDENCE_GATES: ReadonlyArray<Omit<AuthProviderGate, "ready">> = Object.freeze([
  {
    id: "client_registered",
    labelFa: "Client در provider ثبت شده است",
    labelEn: "Provider client is registered",
  },
  {
    id: "redirect_uri_allowlisted",
    labelFa: "Redirect URI و callback allowlist شده‌اند",
    labelEn: "Redirect URI and callback are allowlisted",
  },
  {
    id: "secret_stored_server_side",
    labelFa: "Secret فقط سمت سرور/secret store نگهداری می‌شود",
    labelEn: "Secret is stored only server-side / in secret storage",
  },
  {
    id: "domain_verified",
    labelFa: "دامنه و ownership verification کامل است",
    labelEn: "Domain and ownership verification are complete",
  },
  {
    id: "account_linking_policy",
    labelFa: "Policy اتصال حساب و جلوگیری از takeover آماده است",
    labelEn: "Account-linking and takeover-prevention policy is ready",
  },
  {
    id: "audit_rotation_policy",
    labelFa: "Audit، rotation و incident playbook آماده است",
    labelEn: "Audit, rotation and incident playbook are ready",
  },
]);

const SHARED_POLICY_FIELDS: ReadonlyArray<AuthProviderConfigFieldTemplate> = Object.freeze([
  {
    id: "account_linking_policy_ref",
    labelFa: "Account-linking policy",
    labelEn: "Account-linking policy",
    storage: "policy",
    required: true,
    masked: false,
    gateId: "account_linking_policy",
    helperFa: "قانون اتصال حساب، جلوگیری از takeover و رفتار conflict باید versioned باشد.",
    helperEn: "Account-linking, takeover prevention and conflict behavior must be versioned.",
  },
  {
    id: "audit_rotation_policy_ref",
    labelFa: "Audit و rotation playbook",
    labelEn: "Audit and rotation playbook",
    storage: "policy",
    required: true,
    masked: false,
    gateId: "audit_rotation_policy",
    helperFa: "فعال‌سازی بدون audit trail، rotation cadence و incident owner پذیرفته نمی‌شود.",
    helperEn: "Activation is blocked without audit trail, rotation cadence and an incident owner.",
  },
]);

const PROVIDER_CONFIG_FIELDS: Record<AuthProviderId, ReadonlyArray<AuthProviderConfigFieldTemplate>> = Object.freeze({
  passkey: [
    {
      id: "rp_id",
      labelFa: "RP ID / دامنه WebAuthn",
      labelEn: "WebAuthn RP ID / domain",
      storage: "domain_verification",
      required: true,
      masked: false,
      helperFa: "برای ادمین فعال و از این سطح read-only کنترل می‌شود.",
      helperEn: "Active for admins and read-only from this control surface.",
    },
  ],
  google: [
    {
      id: "client_id",
      labelFa: "Google Client ID",
      labelEn: "Google Client ID",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "Client باید در Google Cloud Console برای دامنه TecPey ثبت شده باشد.",
      helperEn: "Client must be registered in Google Cloud Console for the TecPey domain.",
    },
    {
      id: "client_secret_ref",
      labelFa: "Google Client Secret reference",
      labelEn: "Google Client Secret reference",
      storage: "secret_store",
      required: true,
      masked: true,
      gateId: "secret_stored_server_side",
      helperFa: "مقدار Secret هرگز در مرورگر یا snapshot ادمین نمایش داده نمی‌شود.",
      helperEn: "The secret value is never exposed to the browser or admin snapshot.",
    },
    {
      id: "redirect_uri",
      labelFa: "Google Redirect URI",
      labelEn: "Google Redirect URI",
      storage: "callback_allowlist",
      required: true,
      masked: false,
      gateId: "redirect_uri_allowlisted",
      helperFa: "Callback باید فقط روی allowlist سمت سرور پذیرفته شود.",
      helperEn: "Callback must be accepted only through the server-side allowlist.",
    },
    {
      id: "domain_association",
      labelFa: "Domain ownership",
      labelEn: "Domain ownership",
      storage: "domain_verification",
      required: true,
      masked: false,
      gateId: "domain_verified",
      helperFa: "دامنه و ownership provider باید قبل از فعال‌سازی تایید شود.",
      helperEn: "Domain and provider ownership must be verified before activation.",
    },
    ...SHARED_POLICY_FIELDS,
  ],
  apple: [
    {
      id: "services_id",
      labelFa: "Apple Services ID",
      labelEn: "Apple Services ID",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "Services ID مسیر Sign in with Apple را برای وب مشخص می‌کند.",
      helperEn: "Services ID defines the web path for Sign in with Apple.",
    },
    {
      id: "team_id",
      labelFa: "Apple Team ID",
      labelEn: "Apple Team ID",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "Team ID باید با مالک دامنه و Services ID هم‌خوان باشد.",
      helperEn: "Team ID must match the domain owner and Services ID.",
    },
    {
      id: "key_id",
      labelFa: "Apple Key ID",
      labelEn: "Apple Key ID",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "Key ID برای امضای client secret سمت سرور استفاده می‌شود.",
      helperEn: "Key ID is used to sign the server-side client secret.",
    },
    {
      id: "private_key_ref",
      labelFa: "Apple Private Key reference",
      labelEn: "Apple Private Key reference",
      storage: "secret_store",
      required: true,
      masked: true,
      gateId: "secret_stored_server_side",
      helperFa: "Private key فقط به صورت reference در secret store قابل مشاهده است.",
      helperEn: "Private key is visible only as a secret-store reference.",
    },
    {
      id: "redirect_uri",
      labelFa: "Apple Return URL",
      labelEn: "Apple Return URL",
      storage: "callback_allowlist",
      required: true,
      masked: false,
      gateId: "redirect_uri_allowlisted",
      helperFa: "Return URL باید دقیقا با allowlist provider و سرور هم‌خوان باشد.",
      helperEn: "Return URL must exactly match provider and server allowlists.",
    },
    {
      id: "domain_association",
      labelFa: "Apple domain association",
      labelEn: "Apple domain association",
      storage: "domain_verification",
      required: true,
      masked: false,
      gateId: "domain_verified",
      helperFa: "فایل association و ownership دامنه باید قبل از enable تایید شود.",
      helperEn: "Association file and domain ownership must be verified before enablement.",
    },
    ...SHARED_POLICY_FIELDS,
  ],
  telegram: [
    {
      id: "bot_id",
      labelFa: "Telegram Bot ID",
      labelEn: "Telegram Bot ID",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "Bot باید برای دامنه و policy ورود TecPey ثبت شده باشد.",
      helperEn: "Bot must be registered for the TecPey domain and sign-in policy.",
    },
    {
      id: "bot_token_ref",
      labelFa: "Telegram Bot Token reference",
      labelEn: "Telegram Bot Token reference",
      storage: "secret_store",
      required: true,
      masked: true,
      gateId: "secret_stored_server_side",
      helperFa: "Token فقط سمت سرور نگهداری می‌شود و در UI نمایش داده نمی‌شود.",
      helperEn: "Token is stored server-side only and never shown in the UI.",
    },
    {
      id: "redirect_uri",
      labelFa: "Telegram Callback URL",
      labelEn: "Telegram Callback URL",
      storage: "callback_allowlist",
      required: true,
      masked: false,
      gateId: "redirect_uri_allowlisted",
      helperFa: "Callback باید با دامنه allowlist شده و signature validation همراه باشد.",
      helperEn: "Callback must use an allowlisted domain with signature validation.",
    },
    {
      id: "domain_association",
      labelFa: "Domain binding",
      labelEn: "Domain binding",
      storage: "domain_verification",
      required: true,
      masked: false,
      gateId: "domain_verified",
      helperFa: "دامنه ورود و bot ownership باید تایید شده باشد.",
      helperEn: "Sign-in domain and bot ownership must be verified.",
    },
    ...SHARED_POLICY_FIELDS,
  ],
  email_otp: [
    {
      id: "email_provider_key_ref",
      labelFa: "Email provider API key reference",
      labelEn: "Email provider API key reference",
      storage: "secret_store",
      required: true,
      masked: true,
      gateId: "secret_stored_server_side",
      helperFa: "کلید ارسال ایمیل فقط به صورت reference سمت سرور نگهداری می‌شود.",
      helperEn: "Email API key is stored only as a server-side reference.",
    },
    {
      id: "email_sender_domain",
      labelFa: "Sender domain / SPF DKIM DMARC",
      labelEn: "Sender domain / SPF DKIM DMARC",
      storage: "domain_verification",
      required: true,
      masked: false,
      gateId: "domain_verified",
      helperFa: "دامنه ارسال باید با SPF، DKIM و DMARC تایید شود.",
      helperEn: "Sender domain must be verified with SPF, DKIM and DMARC.",
    },
    {
      id: "redirect_uri",
      labelFa: "Magic-link verify route",
      labelEn: "Magic-link verify route",
      storage: "callback_allowlist",
      required: true,
      masked: false,
      gateId: "redirect_uri_allowlisted",
      helperFa: "مسیر verify باید allowlist و در برابر replay محافظت شود.",
      helperEn: "Verify route must be allowlisted and protected against replay.",
    },
    {
      id: "rate_limit_policy",
      labelFa: "Rate-limit و anti-phishing policy",
      labelEn: "Rate-limit and anti-phishing policy",
      storage: "policy",
      required: true,
      masked: false,
      gateId: "account_linking_policy",
      helperFa: "OTP بدون rate limit، anti-phishing copy و abuse controls فعال نمی‌شود.",
      helperEn: "OTP is blocked without rate limits, anti-phishing copy and abuse controls.",
    },
    {
      id: "client_id",
      labelFa: "Provider account registration",
      labelEn: "Provider account registration",
      storage: "admin_metadata",
      required: true,
      masked: false,
      gateId: "client_registered",
      helperFa: "حساب provider ارسال ایمیل باید برای tenant عملیاتی ثبت شده باشد.",
      helperEn: "Email provider account must be registered for the operating tenant.",
    },
    {
      id: "audit_rotation_policy_ref",
      labelFa: "Delivery audit و rotation playbook",
      labelEn: "Delivery audit and rotation playbook",
      storage: "policy",
      required: true,
      masked: false,
      gateId: "audit_rotation_policy",
      helperFa: "لاگ delivery، bounce و rotation کلید باید قابل audit باشد.",
      helperEn: "Delivery, bounce and key rotation logs must be auditable.",
    },
  ],
});

function gatesFromEvidence(evidence: AuthProviderEvidence = {}): AuthProviderGate[] {
  return AUTH_PROVIDER_EVIDENCE_GATES.map((gate) => ({
    ...gate,
    ready: evidence[gate.id] === true,
  }));
}

function readinessPercent(gates: readonly AuthProviderGate[]): number {
  return Math.round((gates.filter((gate) => gate.ready).length / gates.length) * 100);
}

function allGatesReady(gates: readonly AuthProviderGate[]): boolean {
  return gates.every((gate) => gate.ready);
}

function oauthProviderStatus(socialLoginEnabled: boolean, gates: readonly AuthProviderGate[]): AuthProviderStatus {
  if (!socialLoginEnabled) return "locked";
  return allGatesReady(gates) ? "planned" : "needs_evidence";
}

function configurationFieldsForProvider(
  providerId: AuthProviderId,
  evidence: AuthProviderEvidence = {},
): AuthProviderConfigField[] {
  return PROVIDER_CONFIG_FIELDS[providerId].map((field) => {
    const { gateId, ...safeField } = field;
    const status: AuthProviderConfigStatus =
      providerId === "passkey" ? "managed" : gateId && evidence[gateId] === true ? "configured" : "missing";

    return {
      ...safeField,
      status,
    };
  });
}

function enableDisabledReason(input: {
  providerId: AuthProviderId;
  socialLoginEnabled: boolean;
  missingGateIds: readonly AuthProviderEvidenceGateId[];
  adminLocked: boolean;
}): Pick<AuthProviderControlAction, "disabledReasonFa" | "disabledReasonEn"> {
  if (input.providerId === "passkey") {
    return {
      disabledReasonFa: "Passkey از این سطح read-only است و با surface جداگانه مدیریت می‌شود.",
      disabledReasonEn: "Passkey is read-only here and managed through a separate surface.",
    };
  }

  if (!input.socialLoginEnabled) {
    return {
      disabledReasonFa: "Feature flag social.enabled خاموش است؛ درخواست فعال‌سازی قفل می‌ماند.",
      disabledReasonEn: "The social.enabled feature flag is off; enable requests remain locked.",
    };
  }

  if (input.missingGateIds.length > 0) {
    return {
      disabledReasonFa: `${input.missingGateIds.length.toLocaleString("fa-IR")} evidence gate هنوز کامل نشده است.`,
      disabledReasonEn: `${input.missingGateIds.length} evidence gate(s) are still incomplete.`,
    };
  }

  if (input.adminLocked) {
    return {
      disabledReasonFa: "این Provider هنوز نیازمند implementation و sign-off عملیاتی است.",
      disabledReasonEn: "This provider still requires implementation and operational sign-off.",
    };
  }

  return {
    disabledReasonFa: null,
    disabledReasonEn: null,
  };
}

function buildAdminActions(input: {
  providerId: AuthProviderId;
  status: AuthProviderStatus;
  socialLoginEnabled: boolean;
  missingGateIds: readonly AuthProviderEvidenceGateId[];
  adminLocked: boolean;
  requiredPermission: string;
  stepUpRequired: boolean;
}): AuthProviderControlAction[] {
  const canRequestEnable =
    input.providerId !== "passkey" &&
    input.status !== "configured" &&
    input.socialLoginEnabled &&
    input.missingGateIds.length === 0 &&
    !input.adminLocked;
  const enableReason = canRequestEnable
    ? { disabledReasonFa: null, disabledReasonEn: null }
    : enableDisabledReason(input);
  const hasCallback = input.providerId !== "passkey";
  const callbackReady = hasCallback && !input.missingGateIds.includes("redirect_uri_allowlisted");
  const secretReady = input.providerId !== "passkey" && !input.missingGateIds.includes("secret_stored_server_side");

  return [
    {
      id: "open_setup",
      labelFa: "مشاهده Setup",
      labelEn: "View setup",
      descriptionFa: "فیلدهای لازم، Secret reference، callback و policy همین Provider را نشان می‌دهد.",
      descriptionEn: "Shows required fields, secret reference, callback and policy for this provider.",
      enabled: true,
      locked: false,
      requiredPermission: "admin.roles.read",
      stepUpRequired: false,
      disabledReasonFa: null,
      disabledReasonEn: null,
    },
    {
      id: "verify_callback",
      labelFa: "Verify callback",
      labelEn: "Verify callback",
      descriptionFa: "برای اعتبارسنجی callback و allowlist قبل از فعال‌سازی نهایی.",
      descriptionEn: "Validates callback and allowlist before final enablement.",
      enabled: false,
      locked: true,
      requiredPermission: input.requiredPermission,
      stepUpRequired: input.stepUpRequired,
      disabledReasonFa: hasCallback
        ? callbackReady
          ? "نیازمند اتصال callback verifier و ثبت audit است."
          : "Redirect URI و callback allowlist هنوز کامل نشده‌اند."
        : "Passkey callback خارجی ندارد.",
      disabledReasonEn: hasCallback
        ? callbackReady
          ? "Requires callback verifier integration and audit write."
          : "Redirect URI and callback allowlist are incomplete."
        : "Passkey has no external callback.",
    },
    {
      id: "rotate_secret",
      labelFa: "Rotate secret",
      labelEn: "Rotate secret",
      descriptionFa: "چرخش Secret فقط با secret store، audit و incident playbook مجاز است.",
      descriptionEn: "Secret rotation is allowed only with secret store, audit and incident playbook.",
      enabled: false,
      locked: true,
      requiredPermission: input.requiredPermission,
      stepUpRequired: true,
      disabledReasonFa:
        input.providerId === "passkey"
          ? "Passkey secret مشترک برای rotation در این سطح ندارد."
          : secretReady
            ? "پس از اتصال audit write endpoint فعال می‌شود."
            : "Secret reference سمت سرور هنوز تکمیل نشده است.",
      disabledReasonEn:
        input.providerId === "passkey"
          ? "Passkey has no shared secret to rotate in this surface."
          : secretReady
            ? "Available after audit write endpoint integration."
            : "Server-side secret reference is incomplete.",
    },
    {
      id: "request_enable",
      labelFa: "درخواست فعال‌سازی",
      labelEn: "Request enable",
      descriptionFa: "فقط بعد از تکمیل همه evidence gateها برای بازبینی پذیرفته می‌شود.",
      descriptionEn: "Accepted for review only after every evidence gate is complete.",
      enabled: canRequestEnable,
      locked: !canRequestEnable,
      requiredPermission: input.requiredPermission,
      stepUpRequired: input.stepUpRequired,
      ...enableReason,
    },
    {
      id: "request_disable",
      labelFa: "درخواست غیرفعال‌سازی",
      labelEn: "Request disable",
      descriptionFa: "برای Provider فعال، غیرفعال‌سازی نیز باید audit و step-up داشته باشد.",
      descriptionEn: "For active providers, disable requests also require audit and step-up.",
      enabled: false,
      locked: true,
      requiredPermission: input.requiredPermission,
      stepUpRequired: input.stepUpRequired,
      disabledReasonFa:
        input.providerId === "passkey"
          ? "Passkey ادمین از این mutation surface خاموش نمی‌شود."
          : input.status === "configured"
            ? "نیازمند endpoint غیرفعال‌سازی audit شده است."
            : "Provider فعال نیست؛ غیرفعال‌سازی عملیاتی ندارد.",
      disabledReasonEn:
        input.providerId === "passkey"
          ? "Admin passkey cannot be disabled from this mutation surface."
          : input.status === "configured"
            ? "Requires an audited disable endpoint."
            : "Provider is not active; disable has no operational effect.",
    },
  ];
}

export function isAuthProviderId(value: unknown): value is AuthProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as AuthProviderId);
}

export function isAuthProviderEvidenceGateId(value: unknown): value is AuthProviderEvidenceGateId {
  return typeof value === "string" && AUTH_PROVIDER_EVIDENCE_GATE_IDS.includes(value as AuthProviderEvidenceGateId);
}

export function resolveAuthProviderControlSnapshot(input: {
  now?: Date;
  featureFlags?: Record<FeatureFlag, boolean>;
  evidenceByProvider?: Partial<Record<AuthProviderId, AuthProviderEvidence>>;
} = {}): AuthProviderControlSnapshot {
  const featureFlags = input.featureFlags ?? getAllFlags();
  const socialLoginEnabled = featureFlags["social.enabled"];
  const evidenceByProvider = input.evidenceByProvider ?? {};

  const passkeyGates = AUTH_PROVIDER_EVIDENCE_GATES.map((gate) => ({ ...gate, ready: true }));
  const googleGates = gatesFromEvidence(evidenceByProvider.google);
  const appleGates = gatesFromEvidence(evidenceByProvider.apple);
  const telegramGates = gatesFromEvidence(evidenceByProvider.telegram);
  const emailGates = gatesFromEvidence(evidenceByProvider.email_otp);
  const passkeyMissingGateIds: AuthProviderEvidenceGateId[] = [];
  const googleMissingGateIds = googleGates.filter((gate) => !gate.ready).map((gate) => gate.id);
  const appleMissingGateIds = appleGates.filter((gate) => !gate.ready).map((gate) => gate.id);
  const telegramMissingGateIds = telegramGates.filter((gate) => !gate.ready).map((gate) => gate.id);
  const emailMissingGateIds = emailGates.filter((gate) => !gate.ready).map((gate) => gate.id);
  const googleReadyForReview = socialLoginEnabled && allGatesReady(googleGates);
  const appleReadyForReview = socialLoginEnabled && allGatesReady(appleGates);
  const googleStatus = oauthProviderStatus(socialLoginEnabled, googleGates);
  const appleStatus = oauthProviderStatus(socialLoginEnabled, appleGates);
  const telegramStatus: AuthProviderStatus = socialLoginEnabled ? "planned" : "locked";
  const emailStatus: AuthProviderStatus = socialLoginEnabled ? "planned" : "locked";
  const passkeyAdminLocked = false;
  const googleAdminLocked = !googleReadyForReview;
  const appleAdminLocked = !appleReadyForReview;
  const telegramAdminLocked = true;
  const emailAdminLocked = true;

  const providers: AuthProviderControl[] = [
    {
      id: "passkey",
      labelFa: "Passkey",
      labelEn: "Passkey",
      providerFa: "WebAuthn / Platform Authenticator",
      providerEn: "WebAuthn / Platform Authenticator",
      descriptionFa: "ورود امن بدون رمز برای ادمین فعال است و برای کاربران نیز مسیر آینده کنترل‌شده دارد.",
      descriptionEn: "Passwordless admin access is active and user access has a governed future path.",
      status: "configured",
      riskLevel: "critical",
      requiredPermission: "admin.roles.read",
      stepUpRequired: true,
      adminLocked: passkeyAdminLocked,
      callbackPath: null,
      gates: passkeyGates,
      configurationFields: configurationFieldsForProvider("passkey"),
      adminActions: buildAdminActions({
        providerId: "passkey",
        status: "configured",
        socialLoginEnabled,
        missingGateIds: passkeyMissingGateIds,
        adminLocked: passkeyAdminLocked,
        requiredPermission: "admin.roles.read",
        stepUpRequired: true,
      }),
      readinessPercent: 100,
      missingGateIds: passkeyMissingGateIds,
    },
    {
      id: "google",
      labelFa: "Google Login",
      labelEn: "Google Login",
      providerFa: "Google OAuth 2.0",
      providerEn: "Google OAuth 2.0",
      descriptionFa: "برای ورود آکادمی/حساب کاربری مناسب است، اما تا تکمیل evidence قفل می‌ماند.",
      descriptionEn: "Suitable for Academy/account sign-in, but locked until evidence is complete.",
      status: googleStatus,
      riskLevel: "critical",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: googleAdminLocked,
      callbackPath: "/api/auth/oauth/google/callback",
      gates: googleGates,
      configurationFields: configurationFieldsForProvider("google", evidenceByProvider.google),
      adminActions: buildAdminActions({
        providerId: "google",
        status: googleStatus,
        socialLoginEnabled,
        missingGateIds: googleMissingGateIds,
        adminLocked: googleAdminLocked,
        requiredPermission: "admin.roles.manage",
        stepUpRequired: true,
      }),
      readinessPercent: readinessPercent(googleGates),
      missingGateIds: googleMissingGateIds,
    },
    {
      id: "apple",
      labelFa: "Apple Login",
      labelEn: "Apple Login",
      providerFa: "Sign in with Apple",
      providerEn: "Sign in with Apple",
      descriptionFa: "برای تجربه iOS/Apple-grade عالی است، اما Services ID، private key و domain verification می‌خواهد.",
      descriptionEn: "Excellent for an Apple-grade experience, but requires Services ID, private key and domain verification.",
      status: appleStatus,
      riskLevel: "critical",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: appleAdminLocked,
      callbackPath: "/api/auth/oauth/apple/callback",
      gates: appleGates,
      configurationFields: configurationFieldsForProvider("apple", evidenceByProvider.apple),
      adminActions: buildAdminActions({
        providerId: "apple",
        status: appleStatus,
        socialLoginEnabled,
        missingGateIds: appleMissingGateIds,
        adminLocked: appleAdminLocked,
        requiredPermission: "admin.roles.manage",
        stepUpRequired: true,
      }),
      readinessPercent: readinessPercent(appleGates),
      missingGateIds: appleMissingGateIds,
    },
    {
      id: "telegram",
      labelFa: "Telegram Login",
      labelEn: "Telegram Login",
      providerFa: "Telegram Login Widget / Bot",
      providerEn: "Telegram Login Widget / Bot",
      descriptionFa: "برای بازار ایران می‌تواند گزینه مکمل باشد، اما policy ضد takeover و bot evidence لازم دارد.",
      descriptionEn: "Useful as a complementary Iran-market option, but requires anti-takeover policy and bot evidence.",
      status: telegramStatus,
      riskLevel: "sensitive",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: telegramAdminLocked,
      callbackPath: "/api/auth/oauth/telegram/callback",
      gates: telegramGates,
      configurationFields: configurationFieldsForProvider("telegram", evidenceByProvider.telegram),
      adminActions: buildAdminActions({
        providerId: "telegram",
        status: telegramStatus,
        socialLoginEnabled,
        missingGateIds: telegramMissingGateIds,
        adminLocked: telegramAdminLocked,
        requiredPermission: "admin.roles.manage",
        stepUpRequired: true,
      }),
      readinessPercent: readinessPercent(telegramGates),
      missingGateIds: telegramMissingGateIds,
    },
    {
      id: "email_otp",
      labelFa: "Email OTP / Magic Link",
      labelEn: "Email OTP / Magic Link",
      providerFa: "Transactional Email Provider",
      providerEn: "Transactional Email Provider",
      descriptionFa: "گزینه بازیابی و ورود مکمل است؛ باید rate limit، anti-phishing و delivery evidence داشته باشد.",
      descriptionEn: "A recovery and complementary login option requiring rate limits, anti-phishing and delivery evidence.",
      status: emailStatus,
      riskLevel: "sensitive",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: emailAdminLocked,
      callbackPath: "/api/auth/email-otp/verify",
      gates: emailGates,
      configurationFields: configurationFieldsForProvider("email_otp", evidenceByProvider.email_otp),
      adminActions: buildAdminActions({
        providerId: "email_otp",
        status: emailStatus,
        socialLoginEnabled,
        missingGateIds: emailMissingGateIds,
        adminLocked: emailAdminLocked,
        requiredPermission: "admin.roles.manage",
        stepUpRequired: true,
      }),
      readinessPercent: readinessPercent(emailGates),
      missingGateIds: emailMissingGateIds,
    },
  ];

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    featureFlags,
    summary: {
      totalProviders: providers.length,
      configuredProviders: providers.filter((provider) => provider.status === "configured").length,
      lockedProviders: providers.filter((provider) => provider.status === "locked" || provider.adminLocked).length,
      criticalProviders: providers.filter((provider) => provider.riskLevel === "critical").length,
      stepUpProviders: providers.filter((provider) => provider.stepUpRequired).length,
    },
    providers,
    safetyCopyFa: "هیچ Social/OAuth provider بدون Secret سمت سرور، callback allowlist، policy اتصال حساب و audit فعال نمی‌شود.",
    safetyCopyEn: "No social/OAuth provider activates without server-side secrets, callback allowlists, account-linking policy and audit evidence.",
  };
}

export function evaluateAuthProviderUpdate(input: AuthProviderUpdateInput): AuthProviderUpdateDecision {
  const featureFlags = input.featureFlags ?? getAllFlags();
  const snapshot = resolveAuthProviderControlSnapshot({
    featureFlags,
    evidenceByProvider: { [input.providerId]: input.evidence },
  });
  const provider = snapshot.providers.find((item) => item.id === input.providerId);

  if (!provider || provider.id === "passkey") {
    return {
      ok: false,
      providerId: input.providerId,
      requestedState: input.requestedState,
      error: "auth_provider_read_only",
      httpStatus: 409,
      missingGateIds: [],
    };
  }

  if (
    input.requestedState === "enabled" &&
    (!featureFlags["social.enabled"] || provider.missingGateIds.length > 0 || provider.adminLocked)
  ) {
    return {
      ok: false,
      providerId: input.providerId,
      requestedState: input.requestedState,
      error: "auth_provider_control_locked",
      httpStatus: 423,
      missingGateIds: provider.missingGateIds,
    };
  }

  return {
    ok: true,
    providerId: input.providerId,
    requestedState: input.requestedState,
    status: "accepted_for_review",
  };
}
