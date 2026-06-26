import { createHash, randomBytes } from "crypto";

export type Queryable = { query: (query: string, values?: unknown[]) => Promise<{ rows: any[] }> };

export const certificateCourses = [
  "Crypto Fundamentals",
  "Wallet & Asset Security",
  "Spot Market Operations",
  "Project Research",
  "Chart Reading Basics",
  "Risk Management",
  "Final Readiness Assessment",
];

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

export async function ensureCertificateTables(client: Queryable) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_certificates (
      id TEXT PRIMARY KEY,
      student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
      public_student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      course_title TEXT NOT NULL,
      term_number INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      level_title TEXT NOT NULL DEFAULT 'TecPey Academy Learner',
      verification_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'verified',
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_academy_certificates_student ON academy_certificates(student_id);`);
}

export async function issueCertificate(client: Queryable, input: { studentId: string; termNumber: number }) {
  getCertificateSigningSecret();
  const termNumber = Math.max(1, Math.min(7, Math.round(Number(input.termNumber) || 1)));
  const progress = await client.query(
    `SELECT p.percent, s.display_name
     FROM academy_term_progress p
     JOIN academy_students s ON s.id = p.student_id
     WHERE p.student_id = $1::uuid AND p.term_number = $2 AND p.status = 'passed'
     LIMIT 1`,
    [input.studentId, termNumber],
  );
  const verifiedProgress = progress.rows[0];
  if (!verifiedProgress) throw new Error("term_not_verified");
  const courseTitle = certificateCourses[termNumber - 1] || certificateCourses[0];
  const existing = await client.query(
    `SELECT * FROM academy_certificates WHERE student_id = $1::uuid AND term_number = $2 AND status = 'verified' LIMIT 1`,
    [input.studentId, termNumber],
  );
  if (existing.rows[0]) return existing.rows[0];
  const certificateId = makeCertificateId();
  const publicStudentId = makeStudentPublicId(input.studentId);
  const issuedAt = new Date().toISOString();
  const studentName = String(verifiedProgress.display_name || "TecPey Academy Student").slice(0, 160);
  const score = Math.max(0, Math.min(100, Math.round(Number(verifiedProgress.percent) || 0)));
  const hash = certificateHash({ certificateId, studentId: input.studentId, courseTitle, issuedAt });
  const row = await client.query(
    `INSERT INTO academy_certificates
      (id, student_id, public_student_id, student_name, course_title, term_number, score, level_title, verification_hash, issued_at)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
     RETURNING *`,
    [certificateId, input.studentId, publicStudentId, studentName, courseTitle, termNumber, score, `Term ${termNumber} Verified`, hash, issuedAt],
  );
  return row.rows[0];
}

export async function getCertificate(client: Queryable, certificateId: string) {
  const row = await client.query(`SELECT * FROM academy_certificates WHERE id = $1 LIMIT 1`, [certificateId]);
  return row.rows[0] || null;
}

export function certificateVerifyUrl(certificateId: string) {
  return `${publicBaseUrl()}/verify/${encodeURIComponent(certificateId)}`;
}
