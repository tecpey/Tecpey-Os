import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { issueCertificate } from "@/lib/academy-certificates";
import { awardMilestonesAfterCertificate } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "academy-certificates-read", limit: 80, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  const studentId = cleanText(session?.studentId, 80);
  if (!studentId) return NextResponse.json({ ok: true, certificates: [] });
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query(`SELECT * FROM academy_certificates WHERE student_id = $1::uuid ORDER BY term_number ASC`, [studentId]);
      return rows.rows;
    });
    return NextResponse.json({ ok: true, certificates: result.value || [] });
  } catch {
    return NextResponse.json({ ok: true, certificates: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "academy-certificates-issue", limit: 12, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  const studentId = cleanText(session?.studentId, 80);
  if (!studentId) return NextResponse.json({ ok: false, error: "complete_account_required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const termNumber = Number(body.termNumber || 1);
    const result = await withDb(async (client) => {
      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload) VALUES ($1::uuid, 'certificate_requested', $2::jsonb)`,
        [studentId, JSON.stringify({ termNumber, ip: getClientIp(req), source: "server_verified_progress" })],
      );
      const certificate = await issueCertificate(client, { studentId, termNumber });
      await awardMilestonesAfterCertificate(client, studentId, termNumber, String(certificate.id));
      return certificate;
    });
    if (!result.enabled) return NextResponse.json({ ok: false, error: "certificate_service_unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true, certificate: result.value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "term_not_verified") return NextResponse.json({ ok: false, error: "term_not_verified" }, { status: 403 });
    if (message === "certificate_signing_secret_missing") return NextResponse.json({ ok: false, error: "certificate_service_not_configured" }, { status: 503 });
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
