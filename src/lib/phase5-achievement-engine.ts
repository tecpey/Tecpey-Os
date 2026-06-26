import { createHash } from "crypto";
import { cleanText } from "@/lib/student-cartax";
import { createSmartNotification, ensureLearningOsTables, maybeAwardAchievement, recordLearningEvent, type NotificationChannel } from "@/lib/learning-os";

export type Queryable = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type AchievementView = {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  xp: number;
  earned: boolean;
  earnedAt?: string | null;
};

export type NotificationBrainSnapshot = {
  returnProbability: number;
  churnRisk: number;
  bestChannel: NotificationChannel;
  bestTimeLabel: string;
  nextHookType: "learning" | "mentor" | "simulator" | "achievement" | "community";
  nextActionUrl: string;
  messageTitle: string;
  messageBody: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export async function ensurePhase5Tables(client: Queryable) {
  await ensureLearningOsTables(client);
  await client.query(`
    CREATE TABLE IF NOT EXISTS certificate_share_events (
      id BIGSERIAL PRIMARY KEY,
      certificate_id TEXT NOT NULL,
      student_id UUID,
      channel TEXT NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_brain_snapshots (
      student_id UUID PRIMARY KEY,
      return_probability INTEGER NOT NULL DEFAULT 50,
      churn_risk INTEGER NOT NULL DEFAULT 50,
      best_channel TEXT NOT NULL DEFAULT 'in_app',
      best_time_label TEXT NOT NULL DEFAULT 'evening',
      next_hook_type TEXT NOT NULL DEFAULT 'learning',
      next_action_url TEXT NOT NULL DEFAULT '/academy/profile',
      message_title TEXT NOT NULL,
      message_body TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getAchievementSnapshot(client: Queryable, studentId: string): Promise<AchievementView[]> {
  await ensurePhase5Tables(client);
  const rows = await client.query(
    `SELECT c.code, c.title, c.description, c.icon, c.category, c.xp,
            a.earned_at
     FROM achievement_catalog c
     LEFT JOIN student_achievements a ON a.code = c.code AND a.student_id = $1::uuid
     ORDER BY c.xp ASC, c.code ASC`,
    [studentId],
  );
  return rows.rows.map((row) => ({
    code: String(row.code || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
    icon: String(row.icon || "🏆"),
    category: String(row.category || "learning"),
    xp: Number(row.xp || 0),
    earned: Boolean(row.earned_at),
    earnedAt: row.earned_at ? new Date(String(row.earned_at)).toISOString() : null,
  }));
}

export function fallbackAchievementSnapshot(locale: "fa" | "en" = "fa"): AchievementView[] {
  const isFa = locale === "fa";
  const base = [
    ["first-lesson", isFa ? "اولین درس" : "First lesson", isFa ? "اولین قدم مسیر یادگیری." : "Your first learning step.", "📘", "learning", 50],
    ["first-quiz", isFa ? "اولین آزمون" : "First quiz", isFa ? "اولین آزمون آکادمی ثبت شد." : "Your first academy quiz is recorded.", "✅", "learning", 80],
    ["simulator-journalist", isFa ? "ژورنال‌نویس بازار" : "Market journalist", isFa ? "تصمیم تمرینی خود را با دلیل و برنامه ثبت کردی." : "You logged a practice decision with reason and plan.", "📓", "simulator", 200],
    ["first-certificate", isFa ? "اولین مدرک" : "First certificate", isFa ? "اولین مدرک قابل استعلام." : "Your first verifiable certificate.", "🎓", "certificate", 500],
    ["seven-day-streak", isFa ? "۷ روز پیوسته" : "Seven-day streak", isFa ? "هفت روز به مسیر برگشتی." : "Seven days back on track.", "🔥", "retention", 250],
  ] as const;
  return base.map(([code, title, description, icon, category, xp], index) => ({ code, title, description, icon, category, xp, earned: index < 1, earnedAt: index < 1 ? new Date().toISOString() : null }));
}

export async function buildNotificationBrain(client: Queryable, studentId: string, locale: "fa" | "en" = "fa"): Promise<NotificationBrainSnapshot> {
  await ensurePhase5Tables(client);
  const isFa = locale === "fa";
  const stats = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type IN ('lesson_completed','lesson_viewed'))::int AS learning_events,
       COUNT(*) FILTER (WHERE event_type = 'quiz_attempt_recorded')::int AS quizzes,
       COUNT(*) FILTER (WHERE event_type = 'simulator_decision_saved')::int AS simulator_events,
       COUNT(*) FILTER (WHERE event_type = 'certificate_issued')::int AS certificates,
       MAX(created_at) AS last_event_at
     FROM learning_events
     WHERE student_id = $1::uuid`,
    [studentId],
  );
  const brain = await client.query(`SELECT * FROM learning_brain_profiles WHERE student_id = $1::uuid LIMIT 1`, [studentId]);
  const s = stats.rows[0] || {};
  const b = brain.rows[0] || {};
  const learningEvents = Number(s.learning_events || 0);
  const quizzes = Number(s.quizzes || 0);
  const simulatorEvents = Number(s.simulator_events || 0);
  const certificates = Number(s.certificates || 0);
  const discipline = Number(b.discipline_score || 0);
  const confidence = Number(b.confidence_score || 0);
  const lastEventAt = s.last_event_at ? new Date(String(s.last_event_at)).getTime() : 0;
  const inactiveDays = lastEventAt ? Math.max(0, Math.floor((Date.now() - lastEventAt) / 86_400_000)) : 9;
  const returnProbability = clamp(35 + learningEvents * 5 + quizzes * 7 + simulatorEvents * 8 + certificates * 12 + discipline * 0.18 - inactiveDays * 6);
  const churnRisk = clamp(100 - returnProbability + Math.max(0, inactiveDays - 2) * 8);
  const bestChannel: NotificationChannel = churnRisk > 72 ? "push" : simulatorEvents > 2 ? "in_app" : "email";
  const bestTimeLabel = inactiveDays >= 3 ? (isFa ? "امشب" : "tonight") : (isFa ? "بعد از ظهر" : "afternoon");
  let nextHookType: NotificationBrainSnapshot["nextHookType"] = "learning";
  let nextActionUrl = "/academy/profile";
  let messageTitle = isFa ? "مسیر آکادمی منتظر توست" : "Your academy path is waiting";
  let messageBody = isFa ? "از همان جایی که متوقف شدی ادامه بده." : "Continue from where you left off.";
  if (confidence < 60) {
    nextHookType = "mentor";
    nextActionUrl = "/academy/mentor-coach";
    messageTitle = isFa ? "منتور یک تمرین دقیق‌تر دارد" : "Your mentor has a sharper exercise";
    messageBody = isFa ? "چند پاسخ اخیرت نشان می‌دهد یک چالش هدفمند می‌تواند کمکت کند." : "Your recent answers suggest a targeted challenge can help.";
  } else if (simulatorEvents < 2) {
    nextHookType = "simulator";
    nextActionUrl = "/academy/simulator";
    messageTitle = isFa ? "وقت محک زدن تصمیم‌هاست" : "Time to test your decisions";
    messageBody = isFa ? "یک سناریوی تمرینی با ژورنال و بازخورد منتور آماده است." : "A practice scenario with journal and mentor feedback is ready.";
  } else if (certificates === 0 && learningEvents >= 2) {
    nextHookType = "achievement";
    nextActionUrl = "/academy/certificates";
    messageTitle = isFa ? "به اولین مدرک نزدیک شدی" : "You are close to your first certificate";
    messageBody = isFa ? "با تکمیل آزمون ترم، مسیر صدور مدرک قابل استعلام فعال می‌شود." : "Complete the term assessment to activate certificate issuance.";
  }
  const snapshot = { returnProbability, churnRisk, bestChannel, bestTimeLabel, nextHookType, nextActionUrl, messageTitle, messageBody };
  await client.query(
    `INSERT INTO notification_brain_snapshots
      (student_id, return_probability, churn_risk, best_channel, best_time_label, next_hook_type, next_action_url, message_title, message_body)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (student_id) DO UPDATE SET
       return_probability = EXCLUDED.return_probability,
       churn_risk = EXCLUDED.churn_risk,
       best_channel = EXCLUDED.best_channel,
       best_time_label = EXCLUDED.best_time_label,
       next_hook_type = EXCLUDED.next_hook_type,
       next_action_url = EXCLUDED.next_action_url,
       message_title = EXCLUDED.message_title,
       message_body = EXCLUDED.message_body,
       updated_at = NOW()`,
    [studentId, snapshot.returnProbability, snapshot.churnRisk, snapshot.bestChannel, snapshot.bestTimeLabel, snapshot.nextHookType, snapshot.nextActionUrl, snapshot.messageTitle, snapshot.messageBody],
  );
  return snapshot;
}

export function fallbackNotificationBrain(locale: "fa" | "en" = "fa"): NotificationBrainSnapshot {
  const isFa = locale === "fa";
  return {
    returnProbability: 62,
    churnRisk: 38,
    bestChannel: "in_app",
    bestTimeLabel: isFa ? "امشب" : "tonight",
    nextHookType: "learning",
    nextActionUrl: "/academy/profile",
    messageTitle: isFa ? "مسیر آکادمی آماده ادامه است" : "Your academy path is ready",
    messageBody: isFa ? "بعد از ورود به حساب آکادمی، پیشنهادهای شخصی‌سازی‌شده فعال می‌شوند." : "After academy login, personalized recommendations become active.",
  };
}

export async function createBrainNotification(client: Queryable, studentId: string, locale: "fa" | "en" = "fa") {
  const snapshot = await buildNotificationBrain(client, studentId, locale);
  const fingerprint = createHash("sha256").update([studentId, snapshot.nextHookType, snapshot.nextActionUrl, new Date().toISOString().slice(0, 10)].join("|")).digest("hex").slice(0, 12);
  const existing = await client.query(
    `SELECT 1 FROM notification_center WHERE student_id = $1::uuid AND metadata->>'fingerprint' = $2 LIMIT 1`,
    [studentId, fingerprint],
  );
  if (!existing.rows[0]) {
    await createSmartNotification(client, {
      studentId,
      type: snapshot.nextHookType,
      title: snapshot.messageTitle,
      body: snapshot.messageBody,
      actionUrl: snapshot.nextActionUrl,
      priority: snapshot.churnRisk > 70 ? 4 : 2,
      channels: [snapshot.bestChannel, "in_app"],
      metadata: { fingerprint, brain: snapshot },
    });
    await recordLearningEvent(client, { studentId, eventType: "notification_opened", payload: { generated: true, fingerprint } });
  }
  return snapshot;
}

export async function awardMilestonesAfterCertificate(client: Queryable, studentId: string, termNumber: number, certificateId: string) {
  await maybeAwardAchievement(client, studentId, "first-certificate", { termNumber, certificateId });
  await recordLearningEvent(client, { studentId, eventType: "certificate_issued", payload: { termNumber, certificateId } });
  await createSmartNotification(client, {
    studentId,
    type: "achievement",
    title: "مدرک رسمی تو آماده است",
    body: "گواهی قابل استعلام آکادمی تک‌پی در پرونده آموزشی تو ثبت شد.",
    actionUrl: `/verify/${encodeURIComponent(cleanText(certificateId, 80))}`,
    priority: 5,
    channels: ["in_app", "push"],
    metadata: { termNumber, certificateId },
  });
}
