import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { cleanText } from "@/lib/student-cartax";

export type MentorThread = {
  id: string;
  title: string;
  locale: "fa" | "en";
  status: "active" | "archived";
  summary: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadRow = {
  id: string;
  title: string;
  locale: "fa" | "en";
  status: "active" | "archived";
  summary: string | null;
  last_message_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function snapshot(row: ThreadRow): MentorThread {
  return {
    id: String(row.id),
    title: row.title,
    locale: row.locale,
    status: row.status,
    summary: row.summary,
    lastMessageAt: iso(row.last_message_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function isMentorThreadId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function mentorThreadTitle(value: unknown, locale: "fa" | "en"): string {
  const clean = cleanText(value, 120);
  if (!clean) return locale === "en" ? "New conversation" : "گفت‌وگوی جدید";
  return clean.length > 64 ? `${clean.slice(0, 63).trimEnd()}…` : clean;
}

export async function ensureMentorThreadTx(
  client: PoolClient,
  input: {
    studentId: string;
    threadId?: string | null;
    locale: "fa" | "en";
    titleHint?: string | null;
  },
): Promise<{ thread: MentorThread; created: boolean } | null> {
  if (input.threadId) {
    if (!isMentorThreadId(input.threadId)) return null;
    const owned = await client.query<ThreadRow>(
      `SELECT id, title, locale, status, summary, last_message_at, created_at, updated_at
         FROM mentor_threads
        WHERE id = $1::uuid AND student_id = $2::uuid
        LIMIT 1`,
      [input.threadId, input.studentId],
    );
    if (!owned.rows[0] || owned.rows[0].status !== "active") return null;
    return { thread: snapshot(owned.rows[0]), created: false };
  }

  const inserted = await client.query<ThreadRow>(
    `INSERT INTO mentor_threads (student_id, title, locale, status, origin)
     VALUES ($1::uuid, $2, $3, 'active', 'user')
     RETURNING id, title, locale, status, summary, last_message_at, created_at, updated_at`,
    [input.studentId, mentorThreadTitle(input.titleHint, input.locale), input.locale],
  );
  return { thread: snapshot(inserted.rows[0]), created: true };
}

export async function ensureMentorThread(input: {
  studentId: string;
  threadId?: string | null;
  locale: "fa" | "en";
  titleHint?: string | null;
}): Promise<{ thread: MentorThread; created: boolean } | null> {
  try {
    const result = await withTx((client) => ensureMentorThreadTx(client, input));
    return result.enabled ? result.value : null;
  } catch {
    return null;
  }
}

export async function touchMentorThreadTx(
  client: PoolClient,
  input: { studentId: string; threadId: string; titleHint?: string | null; locale: "fa" | "en" },
): Promise<void> {
  const defaultTitle = input.locale === "en" ? "New conversation" : "گفت‌وگوی جدید";
  const title = mentorThreadTitle(input.titleHint, input.locale);
  await client.query(
    `UPDATE mentor_threads
        SET last_message_at = NOW(),
            title = CASE WHEN title = $3 THEN $4 ELSE title END,
            updated_at = NOW()
      WHERE id = $1::uuid AND student_id = $2::uuid AND status = 'active'`,
    [input.threadId, input.studentId, defaultTitle, title],
  );
}

export async function listMentorThreads(input: {
  studentId: string;
  includeArchived?: boolean;
  limit?: number;
}): Promise<MentorThread[] | "unavailable"> {
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query<ThreadRow>(
        `SELECT id, title, locale, status, summary, last_message_at, created_at, updated_at
           FROM mentor_threads
          WHERE student_id = $1::uuid
            AND ($2::boolean OR status = 'active')
          ORDER BY last_message_at DESC, id DESC
          LIMIT $3`,
        [input.studentId, Boolean(input.includeArchived), Math.max(1, Math.min(100, input.limit ?? 50))],
      );
      return rows.rows.map(snapshot);
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function updateMentorThreadTx(
  client: PoolClient,
  input: {
    studentId: string;
    threadId: string;
    title?: string;
    status?: "active" | "archived";
    locale: "fa" | "en";
  },
): Promise<MentorThread | null> {
  if (!isMentorThreadId(input.threadId)) return null;
  const title = input.title === undefined ? null : mentorThreadTitle(input.title, input.locale);
  const updated = await client.query<ThreadRow>(
    `UPDATE mentor_threads
        SET title = COALESCE($3, title),
            status = COALESCE($4, status),
            updated_at = NOW()
      WHERE id = $1::uuid AND student_id = $2::uuid
      RETURNING id, title, locale, status, summary, last_message_at, created_at, updated_at`,
    [input.threadId, input.studentId, title, input.status ?? null],
  );
  return updated.rows[0] ? snapshot(updated.rows[0]) : null;
}
