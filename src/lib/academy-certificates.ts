import { createHash, randomBytes } from "crypto";
import {
  assertRequiredDatabaseTables,
  type SchemaQueryable,
} from "@/lib/database-schema-contract";

export const certificateCourses = [
  "Crypto Fundamentals",
  "Wallet & Asset Security",
  "Spot Market Operations",
  "Project Research",
  "Chart Reading Basics",
  "Risk Management",
  "Final Readiness Assessment",
];

export type AcademyCertificateRow = {
  id: string;
  student_id: string;
  public_student_id: string;
  student_name: string;
  course_title: string;
  term_number: number;
  score: number;
  level_title: string;
  verification_hash: string;
  issued_at: string;
  status: string;
  revoked_at: string | null;
};

function certificateRow(value: Record<string, unknown> | undefined): AcademyCertificateRow | null {
  if (!value?.id) return null;
  return {
    id: String(value.id),
    student_id: String(value.student_id ?? ""),
    public_student_id: String(value.public_student_id ?? ""),
    student_name: String(value.student_name ?? ""),
    course_title: String(value.course_title ?? ""),
    term_number: Number(value.term_number ?? 0),
    score: Number(value.score ?? 0),
    level_title: String(value.level_title ?? ""),
    verification_hash: String(value.verification_hash ?? ""),
    issued_at: new Date(String(value.issued_at ?? "")).toISOString(),
    status: String(value.status ?? ""),
    revoked_at: value.revoked_at ? new Date(String(value.revoked_at)).toISOString() : null,
  };
}

export function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://tecpey.ir").replace(/\/$/, "");
}

export function makeCertificateId() {
  const year = new Date().getFullYear();
  return `TP-CERT-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function makeStudentPublicId(seed: string) {
  const token = createHash("sha256").update(seed).digest("hex").slice(0, 8).toUpperCase();
  return `TP-STD-${token}`;
}

export function getCertificateSigningSecret() {
  const secret = process.env.CERTIFICATE_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("certificate_signing_secret_missing");
  return secret;
}

export function certificateHash(input: { certificateId: string; studentId: string; courseTitle: string; issuedAt?: string }) {
  const secret = getCertificateSigningSecret();
  return createHash("sha256")
    .update([input.certificateId, input.studentId, input.courseTitle, input.issuedAt || "", secret].join("|"))
    .digest("hex");
}

export async function assertCertificateSchema(client: SchemaQueryable) {
  await assertRequiredDatabaseTables(client, ["academy_certificates"], "academy_certificates");
}

export async function issueCertificate(
  client: SchemaQueryable,
  input: { studentId: string; termNumber: number; tenantId: string; workspaceId: string },
) {
  getCertificateSigningSecret();
  const termNumber = Math.max(1, Math.min(7, Math.round(Number(input.termNumber) || 1)));
  // Certificate issuance is a gate on verified term progress, so it must read
  // the progress recorded in the issuing tenant rather than the student's
  // global history.
  const progress = await client.query(
    `SELECT p.percent, s.display_name
     FROM academy_term_progress p
     JOIN academy_students s ON s.id = p.student_id
     WHERE p.tenant_id = $1 AND p.workspace_id = $2
       AND p.student_id = $3::uuid AND p.term_number = $4 AND p.status = 'passed'
     LIMIT 1`,
    [input.tenantId, input.workspaceId, input.studentId, termNumber],
  );
  const verifiedProgress = progress.rows[0];
  if (!verifiedProgress) throw new Error("term_not_verified");
  const courseTitle = certificateCourses[termNumber - 1] || certificateCourses[0];
  const existing = await client.query(
    `SELECT * FROM academy_certificates WHERE student_id = $1::uuid AND term_number = $2 AND status = 'verified' LIMIT 1`,
    [input.studentId, termNumber],
  );
  const existingCertificate = certificateRow(existing.rows[0]);
  if (existingCertificate) return existingCertificate;
  const certificateId = makeCertificateId();
  const publicStudentId = makeStudentPublicId(input.studentId);
  const issuedAt = new Date().toISOString();
  const studentName = String(verifiedProgress.display_name || "TecPey Academy Student").slice(0, 160);
  const score = Math.max(0, Math.min(100, Math.round(Number(verifiedProgress.percent) || 0)));
  const hash = certificateHash({ certificateId, studentId: input.studentId, courseTitle, issuedAt });
  // academy_certificates_active_term_idx forbids a second verified certificate
  // for the same student and term. The check above races with a concurrent
  // request, so treat the conflict as a replay of whichever request won rather
  // than surfacing a unique violation.
  const row = await client.query(
    `INSERT INTO academy_certificates
      (id, student_id, public_student_id, student_name, course_title, term_number, score, level_title, verification_hash, issued_at)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [certificateId, input.studentId, publicStudentId, studentName, courseTitle, termNumber, score, `Term ${termNumber} Verified`, hash, issuedAt],
  );
  const inserted = certificateRow(row.rows[0]);
  if (inserted) return inserted;

  const winner = await client.query(
    `SELECT * FROM academy_certificates
      WHERE student_id = $1::uuid AND term_number = $2 AND status = 'verified'
      LIMIT 1`,
    [input.studentId, termNumber],
  );
  const raced = certificateRow(winner.rows[0]);
  if (!raced) throw new Error("certificate_insert_failed");
  return raced;
}

export async function getCertificate(client: SchemaQueryable, certificateId: string) {
  const row = await client.query(`SELECT * FROM academy_certificates WHERE id = $1 LIMIT 1`, [certificateId]);
  return certificateRow(row.rows[0]);
}

export function certificateVerifyUrl(certificateId: string) {
  return `${publicBaseUrl()}/verify/${encodeURIComponent(certificateId)}`;
}
