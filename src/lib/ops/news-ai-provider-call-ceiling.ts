export const NEWS_AI_PROVIDER_CALLS_PER_ARTICLE_MAX = 2;

export type NewsAiProviderCallCeilingReason = "provider_call_limit_exceeded";

function blockedResponse(reason: NewsAiProviderCallCeilingReason): Response {
  return new Response(JSON.stringify({ error: { code: `news_ai_${reason}` } }), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-tecpey-news-ai-authority": reason,
    },
  });
}

/**
 * Enforces the initial-activation per-article provider-call ceiling before the
 * cost ledger is consulted and, critically, before provider egress can occur.
 * The durable cost authority remains responsible for reservation/idempotency;
 * this policy guard prevents a translation repair followed by a ticker repair
 * from silently creating a third provider call.
 */
export function withNewsAiProviderCallCeiling(
  fetchImpl: typeof fetch,
  maximumCalls: number = NEWS_AI_PROVIDER_CALLS_PER_ARTICLE_MAX,
): typeof fetch {
  if (!Number.isSafeInteger(maximumCalls) || maximumCalls < 1) {
    throw new Error("news_ai_provider_call_ceiling_invalid");
  }

  let attemptedCalls = 0;
  return async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    attemptedCalls += 1;
    if (attemptedCalls > maximumCalls) {
      return blockedResponse("provider_call_limit_exceeded");
    }
    return fetchImpl(request, init);
  };
}
