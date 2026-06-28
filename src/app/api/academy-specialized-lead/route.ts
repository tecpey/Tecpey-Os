import { mkdir, appendFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";

type LeadPayload = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  mode?: string;
  track?: string;
  note?: string;
  locale?: string;
  source?: string;
  submittedAt?: string;
};

const phonePattern = /^[+0-9\-\s()]{6,24}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max = 500) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;
const MAX_PAYLOAD_BYTES = 5_000;

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const rate = await rateLimit(req, { namespace: "academy-specialized-lead", limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
  if (!rate.ok) {
    return apiRateLimited(rate.retryAfterSeconds);
  }

  try {
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return apiError("payload-too-large", 413);
    }

    let body: LeadPayload;
    try {
      body = JSON.parse(raw) as LeadPayload;
    } catch {
      return apiError("invalid-json", 400);
    }
    const name = clean(body.name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 160);
    const city = clean(body.city, 80);
    const mode = clean(body.mode, 40) || "online";
    const track = clean(body.track, 80) || "risk-first-trading";
    const note = clean(body.note, 1200);
    const locale = clean(body.locale, 12) || "fa";

    if (!name || !phone || !phonePattern.test(phone)) {
      return apiError("invalid-name-or-phone", 400);
    }
    if (email && !emailPattern.test(email)) {
      return apiError("invalid-email", 400);
    }

    const record = {
      id: `academy-specialized-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      phone,
      email,
      city,
      mode,
      track,
      note,
      locale,
      source: clean(body.source, 120) || "academy-specialized-program",
      userAgent: clean(req.headers.get("user-agent") || "unknown", 220),
      ipHint: clean(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown", 80),
      submittedAt: new Date().toISOString(),
    };

    const dir = path.join(process.cwd(), "storage");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "academy-specialized-leads.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
    return apiOk({ id: record.id });
  } catch {
    return apiError("server-error", 500);
  }
}
