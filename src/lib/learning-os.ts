import { createHash, randomUUID } from "crypto";
import { cleanText } from "@/lib/student-cartax";

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

export async function ensureLearningOsTables(client: Queryable) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      student_id UUID,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      locale TEXT NOT NULL DEFAULT 'fa',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS learning_events_student_idx ON learning_events(student_id, created_at DESC);`);
  await client.query(`CREATE INDEX IF NOT EXISTS learning_events_type_idx ON learning_events(event_type, created_at DESC);`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS learning_brain_profiles (
      student_id UUID PRIMARY KEY,
      learning_velocity INTEGER NOT NULL DEFAULT 0,
      attention_score INTEGER NOT NULL DEFAULT 0,
      decision_score INTEGER NOT NULL DEFAULT 0,
      risk_appetite INTEGER NOT NULL DEFAULT 0,
      emotional_stability INTEGER NOT NULL DEFAULT 0,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      discipline_score INTEGER NOT NULL DEFAULT 0,
      weak_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      strong_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      next_best_action TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_question_bank (
      id TEXT PRIMARY KEY,
      locale TEXT NOT NULL DEFAULT 'fa',
      term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 7),
      lesson_slug TEXT NOT NULL,
      topic TEXT NOT NULL,
      cognitive_skill TEXT NOT NULL DEFAULT 'understanding',
      difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
      explanation TEXT,
      approved BOOLEAN NOT NULL DEFAULT TRUE,
      usage_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'tecpey-question-bank',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS question_bank_lookup_idx ON academy_question_bank(locale, term_number, lesson_slug, topic, difficulty);`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS mentor_challenge_attempts (
      id BIGSERIAL PRIMARY KEY,
      student_id UUID NOT NULL,
      question_id TEXT NOT NULL,
      term_number INTEGER NOT NULL,
      lesson_slug TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'fa',
      selected_option TEXT NOT NULL CHECK (selected_option IN ('A','B','C','D')),
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      first_answer TEXT,
      response_time_ms INTEGER NOT NULL DEFAULT 0,
      confidence TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS mentor_attempt_student_idx ON mentor_challenge_attempts(student_id, created_at DESC);`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS achievement_catalog (
      code TEXT PRIMARY KEY,
      locale TEXT NOT NULL DEFAULT 'fa',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏆',
      category TEXT NOT NULL DEFAULT 'learning',
      xp INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS student_achievements (
      student_id UUID NOT NULL,
      code TEXT NOT NULL,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(student_id, code)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_center (
      id UUID PRIMARY KEY,
      student_id UUID,
      type TEXT NOT NULL DEFAULT 'learning',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action_url TEXT,
      priority INTEGER NOT NULL DEFAULT 1,
      channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      read_at TIMESTAMPTZ,
      scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS notification_student_idx ON notification_center(student_id, created_at DESC);`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id BIGSERIAL PRIMARY KEY,
      student_id UUID NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
      channel TEXT NOT NULL DEFAULT 'push',
      token TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'fa',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, platform, token)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

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
      `INSERT INTO achievement_catalog (code, title, description, icon, category, xp)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, icon = EXCLUDED.icon, category = EXCLUDED.category, xp = EXCLUDED.xp`,
      item,
    );
  }
}

async function seedQuestionBank(client: Queryable) {
  const rows = buildDefaultQuestions();
  for (const q of rows) {
    await client.query(
      `INSERT INTO academy_question_bank
       (id, locale, term_number, lesson_slug, topic, cognitive_skill, difficulty, question, options, correct_option, explanation, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [q.id, q.locale, q.termNumber, q.lessonSlug, q.topic, q.skill, q.difficulty, q.question, JSON.stringify(q.options), q.correct, q.explanation],
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
  return base.flatMap((item) => ["fa"].map((locale) => ({ ...item, locale, id: stableId("TQ", `${locale}:${item.termNumber}:${item.lessonSlug}:${item.topic}:${item.question}`) })));
}

export async function recordLearningEvent(client: Queryable, args: { studentId?: string | null; eventType: LearningEventType; source?: string; locale?: string; payload?: Record<string, unknown> }) {
  const eventId = stableId("EVT", `${args.studentId || "anon"}:${args.eventType}:${Date.now()}:${randomUUID()}`);
  await client.query(
    `INSERT INTO learning_events (event_id, student_id, event_type, source, locale, payload)
     VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, args.studentId || null, args.eventType, cleanText(args.source || "web", 40), cleanText(args.locale || "fa", 10), JSON.stringify(args.payload || {})],
  );
  if (args.studentId) await refreshLearningBrain(client, args.studentId);
  return eventId;
}

export async function createSmartNotification(client: Queryable, args: { studentId?: string | null; type: NotificationType; title: string; body: string; actionUrl?: string; priority?: number; channels?: NotificationChannel[]; metadata?: Record<string, unknown>; scheduledFor?: string }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO notification_center (id, student_id, type, title, body, action_url, priority, channels, metadata, scheduled_for)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, COALESCE($10::timestamptz, NOW()))`,
    [id, args.studentId || null, args.type, cleanText(args.title, 160), cleanText(args.body, 500), cleanText(args.actionUrl, 260) || null, Math.max(1, Math.min(5, args.priority || 1)), JSON.stringify(args.channels || ["in_app"]), JSON.stringify(args.metadata || {}), args.scheduledFor || null],
  );
  return id;
}

export async function maybeAwardAchievement(client: Queryable, studentId: string, code: string, payload: Record<string, unknown> = {}) {
  const inserted = await client.query(
    `INSERT INTO student_achievements (student_id, code, payload)
     VALUES ($1::uuid, $2, $3::jsonb)
     ON CONFLICT (student_id, code) DO NOTHING
     RETURNING code`,
    [studentId, code, JSON.stringify(payload)],
  );
  if (inserted.rows[0]) {
    await recordLearningEvent(client, { studentId, eventType: "badge_earned", payload: { code, ...payload } });
    await createSmartNotification(client, {
      studentId,
      type: "achievement",
      title: "نشان جدید در تک‌پی",
      body: "یک دستاورد جدید به پروفایل آموزشی تو اضافه شد.",
      actionUrl: "/academy/achievements",
      priority: 3,
      metadata: { code },
    });
  }
}

export async function refreshLearningBrain(client: Queryable, studentId: string) {
  const stats = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'lesson_completed')::int AS lessons,
       COUNT(*) FILTER (WHERE event_type = 'mentor_challenge_answered')::int AS challenges,
       COUNT(*) FILTER (WHERE event_type = 'simulator_decision_saved')::int AS simulator,
       COUNT(*) FILTER (WHERE event_type = 'quiz_attempt_recorded')::int AS quizzes
     FROM learning_events
     WHERE student_id = $1::uuid`,
    [studentId],
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
      (student_id, learning_velocity, attention_score, decision_score, risk_appetite, emotional_stability, confidence_score, discipline_score, weak_topics, strong_topics, next_best_action)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
     ON CONFLICT (student_id) DO UPDATE SET
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
    [studentId, Math.round(learningVelocity), Math.round(attentionScore), Math.round(decisionScore), Math.round(riskAppetite), Math.round(emotionalStability), Math.round(confidenceScore), Math.round(disciplineScore), JSON.stringify(success < 70 ? ["mentor-challenge"] : []), JSON.stringify(success >= 80 ? ["decision-making"] : []), nextBestAction],
  );
}
