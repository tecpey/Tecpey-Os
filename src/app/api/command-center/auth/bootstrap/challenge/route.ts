import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { verifyAdminBootstrapToken } from "@/lib/admin-passkey-service";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateAdminWebAuthnChallenge,
  getAdminWebAuthnRpConfig,
  storeAdminWebAuthnChallenge,
} from "@/lib/security/admin-webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/bootstrap/challenge" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-bootstrap-challenge",
      limit: 5,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!verifyAdminBootstrapToken(req)) return apiError("admin_bootstrap_unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    if (!validEmail(body.email)) return apiError("invalid_email", 400);
    if (typeof body.displayName !== "string" || body.displayName.trim().length < 2) {
      return apiError("invalid_display_name", 400);
    }

    const email = body.email.trim().toLowerCase();
    const displayName = body.displayName.trim().slice(0, 120);
    const proposedAdminId = randomUUID();
    const challenge = generateAdminWebAuthnChallenge();

    try {
      const result = await withTx(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('tecpey_admin_bootstrap'))`);

        const existingAuthority = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM admin_users
           WHERE status IN ('active', 'suspended', 'disabled')`,
        );
        if ((existingAuthority.rows[0]?.count ?? 0) > 0) {
          throw new Error("admin_bootstrap_closed");
        }

        const pending = await client.query<{ id: string; email: string }>(
          `SELECT id::text, email
           FROM admin_users
           WHERE status = 'invited'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE`,
        );

        let adminId = proposedAdminId;
        if (pending.rows[0]) {
          if (pending.rows[0].email.toLowerCase() !== email) {
            throw new Error("admin_bootstrap_pending_for_another_identity");
          }
          adminId = pending.rows[0].id;
          await client.query(
            `UPDATE admin_users
             SET display_name = $1, updated_at = NOW()
             WHERE id = $2::uuid`,
            [displayName, adminId],
          );
        } else {
          await client.query(
            `INSERT INTO admin_users (id, email, display_name, status)
             VALUES ($1::uuid, $2, $3, 'invited')`,
            [adminId, email, displayName],
          );
        }

        await storeAdminWebAuthnChallenge({
          challenge,
          ceremony: "bootstrap-registration",
          adminId,
        });

        return { adminId };
      });

      if (!result.enabled) return apiError("admin_service_unavailable", 503);
      const rp = getAdminWebAuthnRpConfig();

      return apiOk({
        adminId: result.value.adminId,
        publicKey: {
          challenge,
          rp: { id: rp.rpId, name: rp.rpName },
          user: {
            id: Buffer.from(result.value.adminId).toString("base64url"),
            name: email,
            displayName,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 300_000,
          attestation: "none",
          authenticatorSelection: {
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
        },
      }, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin_bootstrap_failed";
      if (code === "admin_bootstrap_closed") return apiError(code, 409);
      if (code === "admin_bootstrap_pending_for_another_identity") return apiError(code, 409);
      if (code.includes("redis") || code.includes("challenge")) {
        return apiError("admin_webauthn_unavailable", 503);
      }
      return apiError("admin_bootstrap_failed", 500);
    }
  });
}
