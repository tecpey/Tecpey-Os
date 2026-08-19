import { createHash, randomUUID } from "crypto";
import { cleanText } from "@/lib/student-cartax";
import { assertSafeNotificationCopy } from "@/lib/notifications/copy-safety";
import { assertRequiredDatabaseTables } from "@/lib/database-schema-contract";
import { PLATFORM } from "@/lib/platform-config";

type Queryable = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type LearningEventType =
  | "lesson_completed"
  | "quiz_attempt_recorded"
  | "mentor_challenge_answered"
  | "simulator_decision_saved"
  | "certificate_issued"
  | "badge_earned"
  | "notification_opened"
  | "lesson_viewed"
  | "mentor_opened"
  | "community_rank_changed";

export type NotificationChannel = "in_app" | "push" | "email" | "telegram";
export type NotificationType = "learning" | "mentor" | "simulator" | "achievement" | "community" | "market" | "system";

export function stableId(prefix: string, input: string) {
  const digest = createHash("sha256").update(input).digest("hex").slice(0, 14).toUpperCase();
  return `${prefix}-${digest}`;
}

function stableUuid(input: string) {
  const digest = createHash("sha256").update(input).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

export async function prepareLearningOsData(client: Queryable) {
  await assertRequiredDatabaseTables(client, [
    "learning_events",
    "learning_brain_profiles",
    "academy_question_bank",
    "mentor_challenge_attempts",
    "achievement_catalog",
    "student_achievements",
    "notification_center",
    "device_tokens",
    "admin_audit_log",
  ], "learning_os");
  await seedAchievementCatalog(client);
  await seedQuestionBank(client);
}

async function seedAchievementCatalog(client: Queryable) {
  const achievements = [
    ["first-lesson", "اولین درس", "اولین قدم آموزشی خود را در تک‌پی کامل کردی.", "📘", "learning", 50],
    ["first-quiz", "اولین آزمون", "اولین آزمون آکادمی را ثبت کردی.", "✅", "learning", 80],
    ["seven-day-streak", "۷ روز پیوسته", "هفت روز متوالی به مسیر یادگیری برگشتی.", "🔥", "retention", 250],
    ["first-certificate", "اولین مدرک", "اولین گواهی قابل استعلام خود را گرفتی.", "🎓", "certificate", 500],
    ["risk-master", "مدیریت ریسک", "در چالش‌های مدیریت ریسک عملکرد قدرتمندی داشتی.", "⚖️", "mentor", 300],
    ["simulator-journalist", "ژورنال‌نویس بازار", "تصمیم معاملاتی خود را با دلیل، احساس و برنامه ریسک ثبت کردی.", "📓", "simulator", 200],
    ["community-rising", "ستاره در حال رشد", "در جامعه آکادمی تک‌پی دیده شدی.", "🌟", "community", 180]
  ];
  for (const item of achievements) {
    await client.query(
      `INSERT INTO achievement_catalog (id, code, title, description, icon, category, xp_reward, xp)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$6)
       ON CONFLICT (code) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         category = EXCLUDED.category,
         xp_reward = EXCLUDED.xp_reward,
         xp = EXCLUDED.xp`,
      item,
    );
  }
}

async function seedQuestionBank(client: Queryable) {
  const rows = buildDefaultQuestions();
  for (const q of rows) {
    await client.query(
      `INSERT INTO academy_question_bank
       (id, locale, term_number, lesson_index, lesson_slug, topic, cognitive_skill, difficulty, question, options, correct_index, correct_option, explanation, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [q.id, q.locale, q.termNumber, q.lessonIndex, q.lessonSlug, q.topic, q.skill, q.difficulty, q.question, JSON.stringify(q.options), q.correctIndex, q.correct, q.explanation],
    );
  }
}

function buildDefaultQuestions() {
  const base = [
    {
      termNumber: 1,
      lessonSlug: "safe-entry",
      topic: "market-basics",
      skill: "risk-awareness",
      difficulty: 2,
      question: "اگر تازه وارد بازار رمزارز شده‌ای، مسئولانه‌ترین قدم اول چیست؟",
      options: { A: "ورود با کل سرمایه", B: "یادگیری مفاهیم پایه و تمرین بدون ریسک", C: "دنبال کردن سیگنال ناشناس", D: "خرید هر دارایی در رشد شدید" },
      correct: "B",
      explanation: "مسیر امن با یادگیری، تمرین و مدیریت ریسک شروع می‌شود."
    },
    {
      termNumber: 2,
      lessonSlug: "wallet-security",
      topic: "security",
      skill: "decision-making",
      difficulty: 3,
      question: "دوستی از تو Seed Phrase کیف پولت را برای رفع مشکل می‌خواهد. بهترین واکنش چیست؟",
      options: { A: "ارسال فوری برای کمک", B: "ارسال فقط یک کلمه", C: "عدم اشتراک‌گذاری و بررسی از مسیر رسمی", D: "گرفتن اسکرین‌شات و ارسال" },
      correct: "C",
      explanation: "Seed Phrase کلید مالکیت دارایی است و نباید با هیچ فرد یا سرویس غیرمعتبر به اشتراک گذاشته شود."
    },
    {
      termNumber: 3,
      lessonSlug: "spot-orders",
      topic: "exchange-orders",
      skill: "market-structure",
      difficulty: 3,
      question: "در بازار اسپات، سفارش Limit چه زمانی مناسب‌تر است؟",
      options: { A: "وقتی قیمت مشخصی برای ورود یا خروج می‌خواهی", B: "وقتی می‌خواهی هر قیمتی سریع اجرا شود", C: "وقتی بدون تحلیل وارد می‌شوی", D: "وقتی کارمزد را نادیده می‌گیری" },
      correct: "A",
      explanation: "Limit Order برای کنترل قیمت اجرا مناسب است."
    },
    {
      termNumber: 4,
      lessonSlug: "project-research",
      topic: "project-validation",
      skill: "critical-thinking",
      difficulty: 4,
      question: "کدام نشانه برای بررسی اعتبار یک پروژه رمزارزی جدی‌تر است؟",
      options: { A: "وعده سود قطعی", B: "تبلیغ اینفلوئنسرها", C: "شفافیت تیم، توکنومیک و مستندات", D: "رشد قیمت در یک روز" },
      correct: "C",
      explanation: "اعتبارسنجی پروژه با شفافیت، مستندات، ریسک‌ها و داده قابل بررسی انجام می‌شود."
    },
    {
      termNumber: 5,
      lessonSlug: "chart-reading",
      topic: "technical-analysis",
      skill: "analysis",
      difficulty: 4,
      question: "وقتی RSI بالای ۷۰ است، برداشت مسئولانه‌تر کدام است؟",
      options: { A: "همیشه فروش قطعی", B: "احتمال اشباع خرید و نیاز به تأییدهای بیشتر", C: "روند صعودی بدون ریسک", D: "بی‌اهمیت بودن قیمت" },
      correct: "B",
      explanation: "هیچ اندیکاتوری به تنهایی سیگنال قطعی نیست و باید با زمینه بازار سنجیده شود."
    },
    {
      termNumber: 6,
      lessonSlug: "risk-management",
      topic: "risk-management",
      skill: "calculation",
      difficulty: 4,
      question: "اگر سرمایه تمرینی ۱۰۰۰ دلار و قانون ریسک ۲٪ داری، حداکثر زیان مجاز هر معامله چقدر است؟",
      options: { A: "۲۰۰ دلار", B: "۲۰ دلار", C: "۱۰۰ دلار", D: "۵۰ دلار" },
      correct: "B",
      explanation: "۲٪ از ۱۰۰۰ دلار برابر ۲۰ دلار است."
    },
    {
      termNumber: 7,
      lessonSlug: "final-readiness",
      topic: "trading-psychology",
      skill: "behavior-analysis",
      difficulty: 5,
      question: "اگر بازار ۳۰٪ سقوط کند و برنامه ریسک داری، حرفه‌ای‌ترین تصمیم کدام است؟",
      options: { A: "فروش هیجانی همه دارایی", B: "خرید بدون بررسی بیشتر", C: "اجرای برنامه ریسک و بازبینی سناریو", D: "نادیده گرفتن ضرر" },
      correct: "C",
      explanation: "رفتار حرفه‌ای یعنی تصمیم بر اساس برنامه، نه ترس یا طمع."
    }
  ];
  return base.flatMap((item) => ["fa"].map((locale) => ({ ...item, locale, id: stableUuid(`question:${locale}:${item.termNumber}:${item.lessonSlug}:${item.topic}:${item.question}`), lessonIndex: item.termNumber, correctIndex: ["A", "B", "C", "D"].indexOf(item.correct) })));
}

// learning_events gained (workspace_id, principal_type, principal_id) with the
// tenant-principal migration, all NOT NULL and bound by a composite foreign key
// to platform_principal_bindings. This writer was never updated, so every insert
// failed with `null value in column "workspace_id"` — which meant POST
// /api/learning-events answered 500 for every event and the learning brain,
// which only ever refreshes from here, never refreshed at all (audit finding
// F-13).
//
// studentId and workspaceId are required rather than defaulted. student_id is
// NOT NULL, so an anonymous event was never storable; and defaulting the
// workspace would file a tenant's event under a workspace it may not own, which
// the composite binding rejects anyway. Requiring both makes every caller state
// the scope it is writing in.
export async function recordLearningEvent(client: Queryable, args: { studentId: string; tenantId: string; workspaceId: string; eventType: LearningEventType; source?: string; locale?: string; payload?: Record<string, unknown> }) {
  const eventId = stableId("EVT", `${args.studentId}:${args.eventType}:${Date.now()}:${randomUUID()}`);
  const tenantId = cleanText(args.tenantId, 80) || PLATFORM.DEFAULT_TENANT_ID;
  const workspaceId = cleanText(args.workspaceId, 80) || PLATFORM.DEFAULT_WORKSPACE_ID;
  await client.query(
    `INSERT INTO learning_events
       (event_id, tenant_id, workspace_id, principal_type, principal_id, student_id, event_type, source, locale, payload)
     VALUES ($1, $2, $3, 'student', $4::text, $4::uuid, $5, $6, $7, $8::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, tenantId, workspaceId, args.studentId, args.eventType, cleanText(args.source || "web", 40), cleanText(args.locale || "fa", 10), JSON.stringify(args.payload || {})],
  );
  await refreshLearningBrain(client, args.studentId, tenantId);
  return eventId;
}

// scope is required for the same reason it is on recordLearningEvent: the row
// now carries a tenant boundary, and a default would file one tenant's
// notification where another tenant reads it — which is exactly what the legacy
// drain used to do (migration 0071).
export async function createSmartNotification(client: Queryable, args: { studentId?: string | null; scope: { tenantId: string; workspaceId: string }; type: NotificationType; title: string; body: string; actionUrl?: string; priority?: number; channels?: NotificationChannel[]; metadata?: Record<string, unknown>; scheduledFor?: string }) {
  const id = randomUUID();
  const title = cleanText(args.title, 160);
  const body = cleanText(args.body, 500);
  // This is the single write boundary for the automated re-engagement path
  // (the churn "brain", mentor hooks, achievements and campaigns all reach
  // notification_center through here). Unlike the governed producer/policy
  // engine, this legacy path does not evaluate notification copy, so it must
  // enforce copy safety itself, or the governance non-negotiable is bypassed
  // for exactly the personalized copy most likely to drift toward FOMO.
  assertSafeNotificationCopy({ title, body });
  await client.query(
    `INSERT INTO notification_center (id, tenant_id, workspace_id, student_id, type, title, body, action_url, priority, channels, metadata, scheduled_for)
     VALUES ($1, $11, $12, $2::uuid, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, COALESCE($10::timestamptz, NOW()))`,
    // channels is text[], not jsonb. Passing a JSON string failed every insert
    // with `column "channels" is of type text[] but expression is of type
    // jsonb`, so no notification this codebase produces was ever stored (audit
    // finding F-14). pg adapts a JS array to text[] directly.
    [id, args.studentId || null, args.type, title, body, cleanText(args.actionUrl, 260) || null, Math.max(1, Math.min(5, args.priority || 1)), args.channels || ["in_app"], JSON.stringify(args.metadata || {}), args.scheduledFor || null, args.scope.tenantId, args.scope.workspaceId],
  );
  return id;
}

// scope is a required object rather than two defaulted positional arguments.
// Defaulting the workspace filed a non-default-workspace student's badge_earned
// event under 'main', which learning_events_principal_binding_fk rejects — and
// because the callers run on withDb rather than a transaction, the achievement
// row survived while the request failed, so the ON CONFLICT on retry then
// skipped the event and the notification for good.
export async function maybeAwardAchievement(client: Queryable, studentId: string, code: string, payload: Record<string, unknown>, scope: { tenantId: string; workspaceId: string }) {
  const inserted = await client.query(
    `INSERT INTO student_achievements (student_id, achievement_id, code, payload)
     VALUES ($1::uuid, $2, $2, $3::jsonb)
     ON CONFLICT (student_id, code) DO NOTHING
     RETURNING code`,
    [studentId, code, JSON.stringify(payload)],
  );
  if (inserted.rows[0]) {
    await recordLearningEvent(client, { studentId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, eventType: "badge_earned", payload: { code, ...payload } });
    await createSmartNotification(client, {
      studentId,
      scope,
      type: "achievement",
      title: "نشان جدید در تک‌پی",
      body: "یک دستاورد جدید به پروفایل آموزشی تو اضافه شد.",
      actionUrl: "/academy/achievements",
      priority: 3,
      metadata: { code },
    });
  }
}

export async function refreshLearningBrain(
  client: Queryable,
  studentId: string,
  tenantId: string = PLATFORM.DEFAULT_TENANT_ID,
) {
  // learning_events is tenant-scoped; aggregate only this tenant's events for
  // the student so a student admitted into two tenants keeps independent brains.
  // Defaults to the platform default tenant, so single-tenant callers are
  // unchanged.
  const stats = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'lesson_completed')::int AS lessons,
       COUNT(*) FILTER (WHERE event_type = 'mentor_challenge_answered')::int AS challenges,
       COUNT(*) FILTER (WHERE event_type = 'simulator_decision_saved')::int AS simulator,
       COUNT(*) FILTER (WHERE event_type = 'quiz_attempt_recorded')::int AS quizzes
     FROM learning_events
     WHERE student_id = $1::uuid AND tenant_id = $2`,
    [studentId, tenantId],
  );
  const attempts = await client.query(
    `SELECT
       COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END)),0)::int AS success,
       COALESCE(ROUND(AVG(response_time_ms)),0)::int AS avg_time
     FROM mentor_challenge_attempts
     WHERE student_id = $1::uuid`,
    [studentId],
  );
  const s = stats.rows[0] || {};
  const a = attempts.rows[0] || {};
  const lessons = Number(s.lessons || 0);
  const challenges = Number(s.challenges || 0);
  const simulator = Number(s.simulator || 0);
  const quizzes = Number(s.quizzes || 0);
  const success = Number(a.success || 0);
  const avgTime = Number(a.avg_time || 0);
  const learningVelocity = Math.min(100, lessons * 8 + quizzes * 10 + challenges * 4);
  const attentionScore = Math.min(100, avgTime > 15000 ? 85 : avgTime > 7000 ? 70 : 50 + challenges * 3);
  const decisionScore = Math.min(100, success * 0.7 + simulator * 8);
  const riskAppetite = Math.min(100, 45 + simulator * 5);
  const emotionalStability = Math.min(100, 55 + simulator * 6 + (success > 75 ? 10 : 0));
  const confidenceScore = Math.min(100, success || 45);
  const disciplineScore = Math.min(100, lessons * 5 + quizzes * 8 + simulator * 5);
  const nextBestAction = success < 70 ? "mentor-challenge" : simulator < 3 ? "simulator-journal" : "next-lesson";
  await client.query(
    `INSERT INTO learning_brain_profiles
      (tenant_id, student_id, learning_velocity, attention_score, decision_score, risk_appetite, emotional_stability, confidence_score, discipline_score, weak_topics, strong_topics, next_best_action)
     VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[],$12)
     ON CONFLICT (tenant_id, student_id) DO UPDATE SET
       learning_velocity = EXCLUDED.learning_velocity,
       attention_score = EXCLUDED.attention_score,
       decision_score = EXCLUDED.decision_score,
       risk_appetite = EXCLUDED.risk_appetite,
       emotional_stability = EXCLUDED.emotional_stability,
       confidence_score = EXCLUDED.confidence_score,
       discipline_score = EXCLUDED.discipline_score,
       weak_topics = EXCLUDED.weak_topics,
       strong_topics = EXCLUDED.strong_topics,
       next_best_action = EXCLUDED.next_best_action,
       updated_at = NOW()`,
    [tenantId, studentId, Math.round(learningVelocity), Math.round(attentionScore), Math.round(decisionScore), Math.round(riskAppetite), Math.round(emotionalStability), Math.round(confidenceScore), Math.round(disciplineScore), success < 70 ? ["mentor-challenge"] : [], success >= 80 ? ["decision-making"] : [], nextBestAction],
  );
}
