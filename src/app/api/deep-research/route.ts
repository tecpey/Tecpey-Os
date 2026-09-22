import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { withAiTenantTransaction } from "@/lib/ai/database-authority";
import {
  cancelDeepResearchRun,
  claimDeepResearchCommand,
  completeDeepResearchCommand,
  createDeepResearchRun,
  DEEP_RESEARCH_FRESHNESS,
  hashDeepResearchCommand,
  validDeepResearchIdempotencyKey,
  type DeepResearchCommandScope,
  type DeepResearchCreateInput,
} from "@/lib/ai/deep-research-authority";
import { readJsonBody } from "@/lib/security/bounded-request-body";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_KEYS = new Set(["question","locale","requestedFreshness","providerStrategy","budget"]);
const CANCEL_KEYS = new Set(["runId"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

function plainObject(value:unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value:Record<string,unknown>, allowed:Set<string>):boolean {
  return Object.keys(value).every((key)=>allowed.has(key));
}
function correlationId(req:NextRequest):string {
  const candidate=String(req.headers.get("x-tecpey-request-id")??"").trim();
  return CORRELATION.test(candidate) ? candidate : `research-${randomUUID()}`;
}
async function authorize(req:NextRequest) {
  const session=await getCanonicalSession(req,{strictRevocation:true});
  const accountId=session.academyAccountId ?? session.userId ?? session.studentId;
  if (!accountId) {
    return {ok:false as const,response:apiError(session.authorityDegraded?"deep_research_authority_unavailable":"unauthorized",session.authorityDegraded?503:401)};
  }
  const context=await resolveTenantPrincipalContext({
    session,request:req,requiredPrincipalType:"user",scopes:["research:deep:write"],requestId:correlationId(req),
  });
  if (!context.available) {
    return {ok:false as const,response:apiError(context.reason==="binding_storage_unavailable"?"deep_research_authority_unavailable":"forbidden",context.reason==="binding_storage_unavailable"?503:403)};
  }
  return {ok:true as const,accountId,context};
}
function commandScope(input:{
  req:NextRequest;tenantId:string;workspaceId:string;accountId:string;operation:"create"|"cancel";idempotencyKey:string;request:unknown;
}):DeepResearchCommandScope {
  return {
    tenantId:input.tenantId,workspaceId:input.workspaceId,accountId:input.accountId,operation:input.operation,
    idempotencyKey:input.idempotencyKey,requestHash:hashDeepResearchCommand(input.request),correlationId:correlationId(input.req),
  };
}
function replayOrConflict(claim:Awaited<ReturnType<typeof claimDeepResearchCommand>>) {
  if (claim.status==="conflict") return apiError("idempotency_key_reused",409);
  if (claim.status==="in_progress") return apiError("request_in_progress",409);
  if (claim.status==="replayed") return apiOk(claim.response,claim.httpStatus);
  return null;
}

export async function POST(req:NextRequest) {
  return withObservability(req,{route:"/api/deep-research POST"},async()=>{
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden",403);
    // Keep canonical session authority visible at each mutation boundary. authorize()
    // performs the same strict canonical-session + verified tenant/workspace binding;
    // this evidence call is intentionally fail-closed and prevents a future wrapper
    // refactor from making authentication invisible to security-policy generation.
    const boundarySession=await getCanonicalSession(req,{strictRevocation:true});
    if (!(boundarySession.academyAccountId ?? boundarySession.userId ?? boundarySession.studentId)) {
      return apiError(boundarySession.authorityDegraded?"deep_research_authority_unavailable":"unauthorized",boundarySession.authorityDegraded?503:401);
    }
    const auth=await authorize(req);
    if (!auth.ok) return auth.response;
    const identity=`${auth.context.tenantId}:${auth.context.workspaceId}:${auth.accountId}`;
    // Keep the canonical rateLimit call in the mutation handler so the API-security
    // manifest can statically prove resource-consumption protection at the boundary.
    const limited=await rateLimit(req,{namespace:"deep-research-create",limit:8,windowMs:60_000,identity});
    if (!limited.ok) return apiRateLimited(limited.retryAfterSeconds);

    const idempotencyKey=validDeepResearchIdempotencyKey(req.headers.get("idempotency-key"));
    if (!idempotencyKey) return apiError("idempotency_key_required",400);
    const parsed=await readJsonBody(req,{maxBytes:64*1024});
    if (!parsed.ok) return apiError(parsed.error,parsed.status);
    if (!plainObject(parsed.value) || !exactKeys(parsed.value,CREATE_KEYS)) return apiError("invalid_deep_research_request",400);
    const body=parsed.value;
    if (typeof body.question!=="string" || body.question.trim().length<1 || body.question.trim().length>12_000) return apiError("invalid_deep_research_question",400);
    if (body.locale!=="fa" && body.locale!=="en") return apiError("invalid_deep_research_locale",400);
    if (!(DEEP_RESEARCH_FRESHNESS as readonly unknown[]).includes(body.requestedFreshness)) return apiError("invalid_deep_research_freshness",400);
    if (body.providerStrategy!==undefined && !plainObject(body.providerStrategy)) return apiError("invalid_deep_research_provider_strategy",400);
    if (body.budget!==undefined && !plainObject(body.budget)) return apiError("invalid_deep_research_budget",400);

    const normalized:DeepResearchCreateInput={
      tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId,accountId:auth.accountId,
      question:body.question.trim(),locale:body.locale,requestedFreshness:body.requestedFreshness as DeepResearchCreateInput["requestedFreshness"],
      providerStrategy:body.providerStrategy as Record<string,unknown>|undefined,budget:body.budget as Record<string,unknown>|undefined,
    };
    const requestForHash={question:normalized.question,locale:normalized.locale,requestedFreshness:normalized.requestedFreshness,providerStrategy:normalized.providerStrategy??{},budget:normalized.budget??{}};
    const scope=commandScope({req,tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId,accountId:auth.accountId,operation:"create",idempotencyKey,request:requestForHash});
    try {
      const result=await withAiTenantTransaction({tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId},async(client)=>{
        const claim=await claimDeepResearchCommand(client,scope);
        const terminal=replayOrConflict(claim);
        if (terminal) return {response:terminal};
        const run=await createDeepResearchRun(client,normalized);
        const response={run:{id:run.id,state:run.state,createdAt:run.created_at.toISOString()}};
        await completeDeepResearchCommand(client,scope,{httpStatus:201,response,resourceId:run.id});
        return {response:apiOk(response,201)};
      });
      return result.enabled ? result.value.response : apiError("deep_research_authority_unavailable",503);
    } catch(error) {
      const message=error instanceof Error?error.message:"";
      if (message==="deep_research_pro_entitlement_required") return apiError("deep_research_pro_entitlement_required",403);
      if (message==="deep_research_entitlement_authority_invalid") return apiError("deep_research_entitlement_authority_unavailable",503);
      return apiError("deep_research_create_failed",503);
    }
  });
}

export async function DELETE(req:NextRequest) {
  return withObservability(req,{route:"/api/deep-research DELETE"},async()=>{
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden",403);
    const auth=await authorize(req);
    if (!auth.ok) return auth.response;
    const identity=`${auth.context.tenantId}:${auth.context.workspaceId}:${auth.accountId}`;
    // DELETE is independently bounded; do not rely on a helper that static policy
    // evidence cannot resolve.
    const limited=await rateLimit(req,{namespace:"deep-research-cancel",limit:20,windowMs:60_000,identity});
    if (!limited.ok) return apiRateLimited(limited.retryAfterSeconds);

    const idempotencyKey=validDeepResearchIdempotencyKey(req.headers.get("idempotency-key"));
    if (!idempotencyKey) return apiError("idempotency_key_required",400);
    const parsed=await readJsonBody(req,{maxBytes:2*1024});
    if (!parsed.ok) return apiError(parsed.error,parsed.status);
    if (!plainObject(parsed.value) || !exactKeys(parsed.value,CANCEL_KEYS) || typeof parsed.value.runId!=="string" || !UUID.test(parsed.value.runId)) {
      return apiError("invalid_deep_research_run_id",400);
    }
    const runId=parsed.value.runId.toLowerCase();
    const scope=commandScope({req,tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId,accountId:auth.accountId,operation:"cancel",idempotencyKey,request:{runId}});
    try {
      const result=await withAiTenantTransaction({tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId},async(client)=>{
        const claim=await claimDeepResearchCommand(client,scope);
        const terminal=replayOrConflict(claim);
        if (terminal) return {response:terminal};
        const run=await cancelDeepResearchRun(client,{tenantId:auth.context.tenantId,workspaceId:auth.context.workspaceId,accountId:auth.accountId,runId});
        const response={run:{id:run.id,state:run.state,cancelledAt:run.cancelled_at.toISOString()}};
        await completeDeepResearchCommand(client,scope,{httpStatus:200,response,resourceId:run.id});
        return {response:apiOk(response)};
      });
      return result.enabled ? result.value.response : apiError("deep_research_authority_unavailable",503);
    } catch(error) {
      const message=error instanceof Error?error.message:"";
      if (message==="deep_research_run_not_cancellable") return apiError("deep_research_run_not_cancellable",409);
      return apiError("deep_research_cancel_failed",503);
    }
  });
}
