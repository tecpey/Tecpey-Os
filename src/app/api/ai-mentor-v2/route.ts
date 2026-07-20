import { NextRequest } from "next/server";
import { POST as canonicalPost } from "@/app/api/ai-mentor/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mentor V2 used to trust a behavioral snapshot computed in the browser from
 * localStorage and send it directly to a separate stateless AI endpoint.
 *
 * TecPey now has a canonical Mentor backend (`/api/ai-mentor`) that:
 * - authenticates the Academy session,
 * - loads server-side mentor memories/profile/progress from PostgreSQL,
 * - persists user and assistant conversation turns,
 * - triggers mentor-profile recomputation from durable signals.
 *
 * Keep the V2 URL as a compatibility alias for existing UI clients, but route
 * all requests through that canonical backend. Extra legacy request fields such
 * as `behavioralContext` are intentionally ignored by the canonical handler;
 * browser-local state is no longer authoritative AI context.
 */
export async function POST(req: NextRequest) {
  return canonicalPost(req);
}
