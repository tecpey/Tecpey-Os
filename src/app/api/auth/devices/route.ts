// GET /api/auth/devices
// List known devices (trusted device registry) for the current user.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type DeviceRow = {
  id: string;
  fingerprint: string;
  device_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/devices" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "auth-devices", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const dbResult = await withDb(async (db) => {
      const res = await db.query<DeviceRow>(
        `SELECT id, fingerprint, device_name, first_seen_at, last_seen_at
         FROM known_devices
         WHERE user_id = $1
         ORDER BY last_seen_at DESC
         LIMIT 50`,
        [userId],
      );
      return res.rows;
    });

    if (!dbResult.enabled) return apiOk({ devices: [] });

    return apiOk({
      devices: dbResult.value.map((d) => ({
        id: d.id,
        deviceName: d.device_name ?? "Unknown Device",
        firstSeenAt: d.first_seen_at,
        lastSeenAt: d.last_seen_at,
      })),
    });
  });
}
