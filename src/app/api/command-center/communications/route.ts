import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import {
  COMMUNICATION_PROVIDER_IDS,
  loadCommunicationProviderSnapshots,
  recordCommunicationProviderTest,
  updateCommunicationProvider,
  type CommunicationProviderId,
  type CommunicationProviderSettings,
} from "@/lib/communication-provider-store";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { sendEmailWithManagedProvider } from "@/lib/email";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { sendLimooVerificationCode } from "@/lib/security/limoo-sms";
import { normalizeIranianMobile, providerMobileFromE164 } from "@/lib/security/phone-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function providerId(value: unknown): CommunicationProviderId | null {
  return COMMUNICATION_PROVIDER_IDS.includes(value as CommunicationProviderId)
    ? value as CommunicationProviderId
    : null;
}

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return Validate.text(value, 1, max);
}

function normalizeSettings(
  provider: CommunicationProviderId,
  value: unknown,
): CommunicationProviderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (provider === "limoo_sms") {
    const otpFooter = Validate.text(raw.otpFooter, 2, 90);
    return otpFooter ? { otpFooter } : null;
  }
  const fromEmail = Validate.email(raw.fromEmail);
  const fromName = Validate.text(raw.fromName, 2, 100);
  const replyTo = optionalText(raw.replyTo, 254);
  const defaultTemplateId = optionalText(raw.defaultTemplateId, 160);
  if (!fromEmail || !fromName || replyTo === null || defaultTemplateId === null) return null;
  if (replyTo && !Validate.email(replyTo)) return null;
  return { fromEmail, fromName, ...(replyTo ? { replyTo } : {}), ...(defaultTemplateId ? { defaultTemplateId } : {}) };
}

function auditContext(request: NextRequest) {
  return {
    requestId: request.headers.get("x-tecpey-request-id"),
    sourceIp: getClientIp(request),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500),
  };
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/command-center/communications" }, async () => {
    const limit = await rateLimit(request, {
      namespace: "command-center-communications-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);
    const authorization = await authorizeAdminRequest(request, "admin.roles.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const providers = await loadCommunicationProviderSnapshots({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
    });
    if (providers === "unavailable") return apiError("communication_provider_store_unavailable", 503);
    return apiOk({ providers }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(request: NextRequest) {
  return withObservability(request, { route: "/api/command-center/communications" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const limit = await rateLimit(request, {
      namespace: "command-center-communications-write",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);
    const authorization = await authorizeAdminRequest(request, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const bounded = await readBoundedJsonRequest(request, { maxBytes: 12_288 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const value = bounded.value as {
      providerId?: unknown;
      enabled?: unknown;
      apiKey?: unknown;
      settings?: unknown;
    };
    const id = providerId(value.providerId);
    const enabled = typeof value.enabled === "boolean" ? value.enabled : null;
    const settings = id ? normalizeSettings(id, value.settings) : null;
    const apiKey = value.apiKey === undefined || value.apiKey === ""
      ? undefined
      : typeof value.apiKey === "string" && value.apiKey.trim().length >= 8 && value.apiKey.trim().length <= 2_048
        ? value.apiKey.trim()
        : null;
    if (!id || enabled === null || !settings || apiKey === null) {
      return apiError("invalid_communication_provider_request", 400);
    }
    const result = await updateCommunicationProvider({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
      actorAdminId: authorization.principal.adminId,
      sessionId: authorization.principal.sessionId,
      effectiveRoles: authorization.principal.roles,
      providerId: id,
      enabled,
      apiKey,
      settings,
      ...auditContext(request),
    });
    if (result === "secret_required") return apiError("communication_provider_secret_required", 422);
    if (result === "unavailable") return apiError("communication_provider_write_failed", 503);
    return apiOk({ provider: result }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/command-center/communications/test" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const limit = await rateLimit(request, {
      namespace: "command-center-communications-test",
      limit: 3,
      windowMs: 15 * 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);
    const authorization = await authorizeAdminRequest(request, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const bounded = await readBoundedJsonRequest(request, { maxBytes: 2_048 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const value = bounded.value as { providerId?: unknown; testPhone?: unknown };
    const id = providerId(value.providerId);
    if (!id) return apiError("invalid_communication_provider_test", 400);

    let passed = false;
    try {
      if (id === "limoo_sms") {
        const phone = normalizeIranianMobile(value.testPhone);
        if (!phone) return apiError("invalid_iranian_mobile", 400);
        passed = (await sendLimooVerificationCode(providerMobileFromE164(phone), {
          tenantId: authorization.principal.tenantId,
          workspaceId: authorization.principal.workspaceId,
        })).ok;
      } else {
        const result = await sendEmailWithManagedProvider(
          id,
          {
            to: authorization.principal.email,
            subject: "تست اتصال ایمیل تک‌پی",
            text: "اتصال سرویس ایمیل تک‌پی با موفقیت آزمایش شد.",
            html: "<p dir=\"rtl\">اتصال سرویس ایمیل تک‌پی با موفقیت آزمایش شد.</p>",
          },
          {
            tenantId: authorization.principal.tenantId,
            workspaceId: authorization.principal.workspaceId,
          },
        );
        passed = result.ok;
      }
    } catch {
      passed = false;
    }

    const testRecorded = await recordCommunicationProviderTest({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
      actorAdminId: authorization.principal.adminId,
      sessionId: authorization.principal.sessionId,
      effectiveRoles: authorization.principal.roles,
      providerId: id,
      passed,
      ...auditContext(request),
    });
    if (!testRecorded) return apiError("communication_provider_test_unavailable", 503);
    return passed
      ? apiOk({ providerId: id, testStatus: "passed" })
      : apiError("communication_provider_test_failed", 502);
  });
}
