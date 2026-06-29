import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

type AcademyLead = {
  name?: string;
  phone?: string;
  locale?: string;
  termNumber?: number;
  createdAt?: string;
};

function clean(value: unknown, max = 120) {
  return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

function validPhone(phone: string) {
  return /^[0-9+\-\s()]{6,24}$/.test(phone);
}

async function saveToPostgres(lead: Record<string, string | number>) {
  const { withDb } = await import("@/lib/db");
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO academy_leads (name, phone, locale, term_number, ip, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [lead.name, lead.phone, lead.locale, lead.termNumber, lead.ip, lead.userAgent, lead.createdAt],
    );
    return true;
  });
  return { enabled: result.enabled, ok: result.enabled };
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/academy-lead" }, async () => {
    if (!verifyCsrfOrigin(request))
      return apiError("forbidden", 403);
    const limit = await rateLimit(request, { namespace: "academy-lead", limit: 10, windowMs: 60_000 });
    if (!limit.ok) {
      return apiRateLimited(limit.retryAfterSeconds);
    }

    try {
      const raw = await request.text();
      if (raw.length > 2000) {
        return apiError("payload_too_large", 413);
      }

      const body = JSON.parse(raw) as AcademyLead;
      const lead = {
        name: clean(body.name),
        phone: clean(body.phone),
        locale: clean(body.locale || "fa", 10),
        termNumber: Number(body.termNumber || 1),
        createdAt: clean(body.createdAt || new Date().toISOString(), 40),
        ip: clean(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "", 80),
        userAgent: clean(request.headers.get("user-agent") || "", 180),
      };

      if (lead.name.length < 2 || !validPhone(lead.phone)) {
        return apiError("invalid_lead", 400);
      }

      try {
        await saveToPostgres(lead);
      } catch {
        // Local secure queue remains the operational fallback.
      }

      const dir = path.join(process.cwd(), "storage");
      const file = path.join(dir, "academy-leads.jsonl");
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(file, JSON.stringify(lead) + "\n", "utf8");

      const webhookUrl = process.env.ACADEMY_LEADS_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lead),
          });
        } catch {
          // JSONL remains the fallback if CRM/webhook is temporarily unavailable.
        }
      }

      const response = apiOk({});
      response.cookies.set("tecpey_academy_lead_saved", "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    } catch {
      return apiError("server_error", 500);
    }
  });
}
