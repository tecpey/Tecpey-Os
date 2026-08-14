import { getAllFlags, type FeatureFlag } from "./feature-flags";

export type AuthProviderId = "passkey" | "google" | "apple" | "telegram" | "email_otp";
export type AuthProviderStatus = "configured" | "locked" | "planned" | "needs_evidence" | "disabled";
export type AuthProviderRiskLevel = "standard" | "sensitive" | "critical";
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

export function isAuthProviderId(value: unknown): value is AuthProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as AuthProviderId);
}

export function resolveAuthProviderControlSnapshot(input: {
  now?: Date;
  featureFlags?: Record<FeatureFlag, boolean>;
  evidenceByProvider?: Partial<Record<AuthProviderId, AuthProviderEvidence>>;
} = {}): AuthProviderControlSnapshot {
  const featureFlags = input.featureFlags ?? getAllFlags();
  const socialLoginEnabled = featureFlags["social.enabled"];
  const evidenceByProvider = input.evidenceByProvider ?? {};

  const googleGates = gatesFromEvidence(evidenceByProvider.google);
  const appleGates = gatesFromEvidence(evidenceByProvider.apple);
  const telegramGates = gatesFromEvidence(evidenceByProvider.telegram);
  const emailGates = gatesFromEvidence(evidenceByProvider.email_otp);
  const googleReadyForReview = socialLoginEnabled && allGatesReady(googleGates);
  const appleReadyForReview = socialLoginEnabled && allGatesReady(appleGates);

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
      adminLocked: false,
      callbackPath: null,
      gates: AUTH_PROVIDER_EVIDENCE_GATES.map((gate) => ({ ...gate, ready: true })),
      readinessPercent: 100,
      missingGateIds: [],
    },
    {
      id: "google",
      labelFa: "Google Login",
      labelEn: "Google Login",
      providerFa: "Google OAuth 2.0",
      providerEn: "Google OAuth 2.0",
      descriptionFa: "برای ورود آکادمی/حساب کاربری مناسب است، اما تا تکمیل evidence قفل می‌ماند.",
      descriptionEn: "Suitable for Academy/account sign-in, but locked until evidence is complete.",
      status: oauthProviderStatus(socialLoginEnabled, googleGates),
      riskLevel: "critical",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: !googleReadyForReview,
      callbackPath: "/api/auth/oauth/google/callback",
      gates: googleGates,
      readinessPercent: readinessPercent(googleGates),
      missingGateIds: googleGates.filter((gate) => !gate.ready).map((gate) => gate.id),
    },
    {
      id: "apple",
      labelFa: "Apple Login",
      labelEn: "Apple Login",
      providerFa: "Sign in with Apple",
      providerEn: "Sign in with Apple",
      descriptionFa: "برای تجربه iOS/Apple-grade عالی است، اما Services ID، private key و domain verification می‌خواهد.",
      descriptionEn: "Excellent for an Apple-grade experience, but requires Services ID, private key and domain verification.",
      status: oauthProviderStatus(socialLoginEnabled, appleGates),
      riskLevel: "critical",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: !appleReadyForReview,
      callbackPath: "/api/auth/oauth/apple/callback",
      gates: appleGates,
      readinessPercent: readinessPercent(appleGates),
      missingGateIds: appleGates.filter((gate) => !gate.ready).map((gate) => gate.id),
    },
    {
      id: "telegram",
      labelFa: "Telegram Login",
      labelEn: "Telegram Login",
      providerFa: "Telegram Login Widget / Bot",
      providerEn: "Telegram Login Widget / Bot",
      descriptionFa: "برای بازار ایران می‌تواند گزینه مکمل باشد، اما policy ضد takeover و bot evidence لازم دارد.",
      descriptionEn: "Useful as a complementary Iran-market option, but requires anti-takeover policy and bot evidence.",
      status: socialLoginEnabled ? "planned" : "locked",
      riskLevel: "sensitive",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: true,
      callbackPath: "/api/auth/oauth/telegram/callback",
      gates: telegramGates,
      readinessPercent: readinessPercent(telegramGates),
      missingGateIds: telegramGates.filter((gate) => !gate.ready).map((gate) => gate.id),
    },
    {
      id: "email_otp",
      labelFa: "Email OTP / Magic Link",
      labelEn: "Email OTP / Magic Link",
      providerFa: "Transactional Email Provider",
      providerEn: "Transactional Email Provider",
      descriptionFa: "گزینه بازیابی و ورود مکمل است؛ باید rate limit، anti-phishing و delivery evidence داشته باشد.",
      descriptionEn: "A recovery and complementary login option requiring rate limits, anti-phishing and delivery evidence.",
      status: socialLoginEnabled ? "planned" : "locked",
      riskLevel: "sensitive",
      requiredPermission: "admin.roles.manage",
      stepUpRequired: true,
      adminLocked: true,
      callbackPath: "/api/auth/email-otp/verify",
      gates: emailGates,
      readinessPercent: readinessPercent(emailGates),
      missingGateIds: emailGates.filter((gate) => !gate.ready).map((gate) => gate.id),
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
  const snapshot = resolveAuthProviderControlSnapshot({
    featureFlags: input.featureFlags,
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
    (!input.featureFlags?.["social.enabled"] || provider.missingGateIds.length > 0 || provider.adminLocked)
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
