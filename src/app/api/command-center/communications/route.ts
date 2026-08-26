import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { withTx } from "@/lib/db";
import {
  COMMUNICATION_PROVIDER_IDS,
  loadCommunicationProviderSnapshots,
  recordCommunicationProviderOperation,
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
import {
  claimApiCommandTx,
  completeApiCommandTx,
  hashApiCommand,
  parseApiIdempotencyKey,
  type ApiCommandScope,
} from "@/lib/security/api-command-idempotency";
import {
  getLimooCurrentCredit,
  getLimooMessageStatus,
  getLimooReceivedMessages,
  sendLimooPatternMessage,
  sendLimooPeerToPeerSms,
  sendLimooSms,
  sendLimooVerificationCode,
  type LimooOperationResult,
} from "@/lib/security/limoo-sms";
import { normalizeLimooPatternId } from "@/lib/security/limoo-pattern-id";
import { generatePhoneOtpCode } from "@/lib/security/phone-otp-code";
import { normalizeIranianMobile, providerMobileFromE164 } from "@/lib/security/phone-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMOO_ACTIONS = [
  "limoo_credit",
  "limoo_send_sms",
  "limoo_send_peer",
  "limoo_send_pattern",
  "limoo_status",
  "limoo_received",
] as const;
type LimooSendAction =
  | "limoo_send_sms"
  | "limoo_send_peer"
  | "limoo_send_pattern";
type LimooCommandReceipt = {
  providerId: "limoo_sms";
  action: LimooSendAction;
  result: unknown;
};

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
  enabled: boolean | null,
): CommunicationProviderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (provider === "limoo_sms") {
    if (String(raw.otpPatternId ?? "").trim() === "" && enabled === false) return {};
    const otpPatternId = normalizeLimooPatternId(raw.otpPatternId);
    return otpPatternId ? { otpPatternId } : null;
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

function safeMessage(value: unknown, min = 1, max = 500): string | null {
  const message = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  return message.length >= min && message.length <= max ? message : null;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\r\n,]+/)
      : [];
  if (source.length < 1 || source.length > maxItems) return null;
  const output: string[] = [];
  for (const item of source) {
    const raw = String(item ?? "").trim();
    if (raw.length < 1 || raw.length > maxLength) return null;
    const text = Validate.text(raw, 1, maxLength);
    if (!text) return null;
    output.push(text);
  }
  return output;
}

function iranianMobiles(value: unknown): string[] | null {
  const source = stringList(value, 20, 32);
  if (!source) return null;
  const output: string[] = [];
  for (const item of source) {
    const normalized = normalizeIranianMobile(item);
    if (!normalized) return null;
    output.push(providerMobileFromE164(normalized));
  }
  return [...new Set(output)];
}

function senderNumber(value: unknown): string | null {
  const sender = String(value ?? "").trim();
  return /^[+]?[0-9]{3,32}$/.test(sender) ? sender : null;
}

function limooDependencies(tenantId: string, workspaceId: string) {
  return { tenantId, workspaceId };
}

type AuthorizedAdmin = Awaited<ReturnType<typeof authorizeAdminRequest>> & { ok: true };

async function claimLimooSendCommand(
  request: NextRequest,
  authorization: AuthorizedAdmin,
  value: Record<string, unknown>,
  action: LimooSendAction,
  canonicalPayload: Record<string, unknown>,
): Promise<
  | { scope: ApiCommandScope; response?: never }
  | { scope?: never; response: ReturnType<typeof apiError> }
> {
  const idempotencyKey = parseApiIdempotencyKey(
    request.headers.get("Idempotency-Key"),
    value.idempotencyKey,
  );
  if (!idempotencyKey) {
    return { response: apiError("idempotency_key_required", 400) };
  }
  const scope: ApiCommandScope = {
    tenantId: authorization.principal.tenantId,
    principalType: "admin",
    principalId: authorization.principal.adminId,
    operation: `communications.${action}`,
    idempotencyKey,
    requestHash: hashApiCommand(canonicalPayload),
  };
  try {
    const claimed = await withTx((client) =>
      claimApiCommandTx<LimooCommandReceipt>(client, scope)
    );
    if (!claimed.enabled) {
      return { response: apiError("communication_provider_receipt_unavailable", 503) };
    }
    if (claimed.value.status === "conflict") {
      return { response: apiError("idempotency_conflict", 409) };
    }
    if (claimed.value.status === "in_progress") {
      return { response: apiError("idempotency_in_progress", 409) };
    }
    if (claimed.value.status === "replayed") {
      return { response: apiOk(claimed.value.response, claimed.value.httpStatus) };
    }
    return { scope };
  } catch {
    return { response: apiError("communication_provider_receipt_unavailable", 503) };
  }
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
    const settings = id ? normalizeSettings(id, value.settings, enabled) : null;
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

async function testProvider(
  value: Record<string, unknown>,
  authorization: Awaited<ReturnType<typeof authorizeAdminRequest>> & { ok: true },
): Promise<{ id: CommunicationProviderId; passed: boolean } | null> {
  const id = providerId(value.providerId);
  if (!id) return null;
  let passed = false;
  try {
    if (id === "limoo_sms") {
      const phone = normalizeIranianMobile(value.testPhone);
      if (!phone) return null;
      passed = (await sendLimooVerificationCode(
        providerMobileFromE164(phone),
        generatePhoneOtpCode(),
        limooDependencies(
          authorization.principal.tenantId,
          authorization.principal.workspaceId,
        ),
      )).ok;
    } else {
      const result = await sendEmailWithManagedProvider(
        id,
        {
          to: authorization.principal.email,
          subject: "تست اتصال ایمیل تک‌پی",
          text: "اتصال سرویس ایمیل تک‌پی با موفقیت آزمایش شد.",
          html: "<p dir=\"rtl\">اتصال سرویس ایمیل تک‌پی با موفقیت آزمایش شد.</p>",
        },
        limooDependencies(
          authorization.principal.tenantId,
          authorization.principal.workspaceId,
        ),
      );
      passed = result.ok;
    }
  } catch {
    passed = false;
  }
  return { id, passed };
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/command-center/communications/test" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const authorization = await authorizeAdminRequest(request, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const bounded = await readBoundedJsonRequest(request, { maxBytes: 24_576 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const value = bounded.value as Record<string, unknown>;
    const requestedAction = value.action ?? "test";

    if (requestedAction === "test") {
      const limit = await rateLimit(request, {
        namespace: "command-center-communications-test",
        limit: 3,
        windowMs: 15 * 60_000,
      });
      if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);
      const tested = await testProvider(value, authorization);
      if (!tested) {
        return apiError(
          value.providerId === "limoo_sms" ? "invalid_iranian_mobile" : "invalid_communication_provider_test",
          400,
        );
      }
      const testRecorded = await recordCommunicationProviderTest({
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        actorAdminId: authorization.principal.adminId,
        sessionId: authorization.principal.sessionId,
        effectiveRoles: authorization.principal.roles,
        providerId: tested.id,
        passed: tested.passed,
        ...auditContext(request),
      });
      if (!testRecorded) return apiError("communication_provider_test_unavailable", 503);
      return tested.passed
        ? apiOk({ providerId: tested.id, testStatus: "passed" })
        : apiError("communication_provider_test_failed", 502);
    }

    const action = Validate.oneOf(requestedAction, LIMOO_ACTIONS);
    if (!action) return apiError("invalid_communication_provider_action", 400);
    const readOnly = action === "limoo_credit" || action === "limoo_status" || action === "limoo_received";
    const limit = await rateLimit(request, {
      namespace: readOnly
        ? "command-center-communications-limoo-read"
        : "command-center-communications-limoo-send",
      limit: readOnly ? 30 : 10,
      windowMs: readOnly ? 60_000 : 15 * 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const dependencies = limooDependencies(
      authorization.principal.tenantId,
      authorization.principal.workspaceId,
    );
    let result: LimooOperationResult;
    let metadata: Record<string, string | number | boolean> = {};
    let receiptScope: ApiCommandScope | null = null;

    if (action === "limoo_credit") {
      result = await getLimooCurrentCredit(dependencies);
    } else if (action === "limoo_send_sms") {
      const sender = senderNumber(value.senderNumber);
      const message = safeMessage(value.message);
      const recipients = iranianMobiles(value.mobileNumbers);
      if (!sender || !message || !recipients) return apiError("invalid_limoo_sms_request", 400);
      const command = {
        senderNumber: sender,
        message,
        mobileNumbers: recipients,
        sendToBlockedNumbers: value.sendToBlockedNumbers === true,
      };
      const claimed = await claimLimooSendCommand(request, authorization, value, action, command);
      if (claimed.response) return claimed.response;
      receiptScope = claimed.scope;
      metadata = { recipientCount: recipients.length };
      result = await sendLimooSms(command, dependencies);
    } else if (action === "limoo_send_peer") {
      const sender = senderNumber(value.senderNumber);
      const messagesRaw = Array.isArray(value.messages)
        ? value.messages
        : typeof value.messages === "string"
          ? value.messages.split(/\r?\n/)
          : [];
      const messages = messagesRaw.map((message) => safeMessage(message)).filter(
        (message): message is string => Boolean(message),
      );
      const recipients = iranianMobiles(value.mobileNumbers);
      if (!sender || !recipients || messages.length !== recipients.length || messages.length < 1) {
        return apiError("invalid_limoo_peer_request", 400);
      }
      const command = {
        senderNumber: sender,
        messages,
        mobileNumbers: recipients,
        sendToBlockedNumbers: value.sendToBlockedNumbers === true,
      };
      const claimed = await claimLimooSendCommand(request, authorization, value, action, command);
      if (claimed.response) return claimed.response;
      receiptScope = claimed.scope;
      metadata = { recipientCount: recipients.length, messageCount: messages.length };
      result = await sendLimooPeerToPeerSms(command, dependencies);
    } else if (action === "limoo_send_pattern") {
      const patternId = normalizeLimooPatternId(value.patternId);
      const replacements = stringList(value.replaceTokens, 10, 128);
      const recipients = iranianMobiles([value.mobileNumber]);
      if (!patternId || !replacements || !recipients?.[0]) {
        return apiError("invalid_limoo_pattern_request", 400);
      }
      const command = {
        patternId,
        replaceTokens: replacements,
        mobileNumber: recipients[0],
      };
      const claimed = await claimLimooSendCommand(request, authorization, value, action, command);
      if (claimed.response) return claimed.response;
      receiptScope = claimed.scope;
      metadata = { recipientCount: 1, tokenCount: replacements.length, patternId };
      result = await sendLimooPatternMessage(command, dependencies);
    } else if (action === "limoo_status") {
      const messageIds = stringList(value.messageIds, 100, 128);
      if (!messageIds) return apiError("invalid_limoo_status_request", 400);
      metadata = { messageIdCount: messageIds.length };
      result = await getLimooMessageStatus(messageIds, dependencies);
    } else {
      const number = senderNumber(value.number);
      const page = Validate.int(value.page, 1, 10_000);
      const size = Validate.int(value.size, 1, 100);
      if (!number || !page || !size) return apiError("invalid_limoo_received_request", 400);
      metadata = { page, size };
      result = await getLimooReceivedMessages({ number, page, size }, dependencies);
    }

    const operationRecorded = await recordCommunicationProviderOperation({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
      actorAdminId: authorization.principal.adminId,
      sessionId: authorization.principal.sessionId,
      effectiveRoles: authorization.principal.roles,
      providerId: "limoo_sms",
      operation: action,
      passed: result.ok,
      metadata,
      ...auditContext(request),
    });
    if (!operationRecorded) return apiError("communication_provider_audit_unavailable", 503);
    if (!result.ok) return apiError("limoo_operation_failed", 502, { reason: result.reason });

    const responsePayload = {
      providerId: "limoo_sms" as const,
      action,
      result: result.data,
    };
    if (receiptScope) {
      const receiptPayload: LimooCommandReceipt = {
        ...responsePayload,
        action: action as LimooSendAction,
      };
      try {
        const completed = await withTx(async (client) => {
          await completeApiCommandTx(client, receiptScope as ApiCommandScope, {
            httpStatus: 200,
            response: receiptPayload,
          });
          return true;
        });
        if (!completed.enabled) {
          return apiError("communication_provider_receipt_unavailable", 503);
        }
      } catch {
        return apiError("communication_provider_receipt_unavailable", 503);
      }
    }
    return apiOk(responsePayload);
  });
}
