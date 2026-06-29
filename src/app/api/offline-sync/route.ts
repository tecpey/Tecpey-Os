import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { normalizeOfflineSyncItem, offlineManifest, type OfflineSyncItem, type OfflineSyncResult } from "@/lib/offline-sync";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

function canUseLocal() {
  return process.env.NODE_ENV !== "production" || process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true";
}

function localPath() {
  return path.join(process.cwd(), "storage", "offline-sync.local.json");
}

async function readLocal(): Promise<Record<string, OfflineSyncItem[]>> {
  if (!canUseLocal()) return {};
  try {
    const parsed = JSON.parse(await readFile(localPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocal(store: Record<string, OfflineSyncItem[]>) {
  if (!canUseLocal()) return;
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(store, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    const url = new URL(req.url);
    const locale = cleanText(url.searchParams.get("locale") || "fa", 8) === "en" ? "en" : "fa";
    return apiOk({ manifest: offlineManifest(locale) });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "offline-sync", limit: 30, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req);
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const studentId = session.studentId;

    try {
      const raw = await req.text();
      if (raw.length > 80_000) return apiError("payload_too_large", 413);
      const body = JSON.parse(raw || "{}");
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) return apiOk({ accepted: 0, rejected: 0, results: [] });

      const normalized: OfflineSyncItem[] = [];
      const results: OfflineSyncResult[] = [];
      for (const item of items) {
        const parsed = normalizeOfflineSyncItem(item);
        if (!parsed.ok) results.push({ id: parsed.id || "unknown", status: "rejected", reason: parsed.reason });
        else {
          normalized.push(parsed.item);
          results.push({ id: parsed.item.id, status: "accepted" });
        }
      }

      const db = await withDb(async (client) => {
        for (const item of normalized) {
          await recordLearningEvent(client, {
            studentId,
            eventType: item.eventType as any,
            source: item.source,
            locale: item.locale,
            payload: { ...item.payload, offlineEventId: item.id, clientCreatedAt: item.clientCreatedAt, syncedAt: new Date().toISOString() },
          });
        }
        return true;
      });

      if (!db.enabled && normalized.length) {
        const store = await readLocal();
        const current = store[studentId] || [];
        const seen = new Set(current.map((item) => item.id));
        store[studentId] = [...current, ...normalized.filter((item) => !seen.has(item.id))].slice(-500);
        await writeLocal(store);
      }

      return apiOk({ accepted: normalized.length, rejected: results.filter((r) => r.status === "rejected").length, results });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
