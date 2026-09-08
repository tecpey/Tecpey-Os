import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0101_academy_question_bank_baseline.sql";

export const ACADEMY_QUESTION_BANK_BASELINE_SQL = `
INSERT INTO academy_question_bank
  (id, locale, term_number, lesson_index, lesson_slug, topic, cognitive_skill, difficulty, question, options, correct_index, correct_option, explanation, approved)
VALUES
  ('1eba66a4-a429-58a1-ab0a-45e1c0381bc2', 'fa', 1, 1, 'safe-entry', 'market-basics', 'risk-awareness', 2,
   'اگر تازه وارد بازار رمزارز شده‌ای، مسئولانه‌ترین قدم اول چیست؟',
   '{"A":"ورود با کل سرمایه","B":"یادگیری مفاهیم پایه و تمرین بدون ریسک","C":"دنبال کردن سیگنال ناشناس","D":"خرید هر دارایی در رشد شدید"}'::jsonb,
   1, 'B', 'مسیر امن با یادگیری، تمرین و مدیریت ریسک شروع می‌شود.', TRUE),
  ('2ad60088-d252-574d-929f-a2ca339cddf4', 'fa', 2, 2, 'wallet-security', 'security', 'decision-making', 3,
   'اگر فردی برای رفع مشکل کیف پول از تو Seed Phrase بخواهد، بهترین واکنش چیست؟',
   '{"A":"ارسال فوری برای کمک","B":"ارسال فقط بخشی از عبارت","C":"عدم اشتراک‌گذاری و بررسی از مسیر رسمی","D":"گرفتن اسکرین‌شات و ارسال"}'::jsonb,
   2, 'C', 'Seed Phrase کلید مالکیت دارایی است و نباید در اختیار فرد یا سرویس دیگری قرار بگیرد.', TRUE),
  ('c1bf0e90-7f6f-531d-920a-1439c0e29c50', 'fa', 3, 3, 'spot-orders', 'exchange-orders', 'market-structure', 3,
   'در بازار اسپات، سفارش Limit چه زمانی مناسب‌تر است؟',
   '{"A":"وقتی قیمت مشخصی برای ورود یا خروج می‌خواهی","B":"وقتی می‌خواهی با هر قیمتی فوراً اجرا شود","C":"وقتی بدون تحلیل وارد می‌شوی","D":"وقتی کارمزد را نادیده می‌گیری"}'::jsonb,
   0, 'A', 'Limit Order برای کنترل قیمت اجرای سفارش مناسب است و اجرای آن تضمین‌شده نیست.', TRUE),
  ('9e53a6da-70de-54b1-adec-b6351b6ad442', 'fa', 4, 4, 'project-research', 'project-validation', 'critical-thinking', 4,
   'کدام نشانه برای بررسی اعتبار یک پروژه رمزارزی جدی‌تر است؟',
   '{"A":"وعده سود قطعی","B":"تبلیغ گسترده اینفلوئنسرها","C":"شفافیت تیم، توکنومیک، مستندات و ریسک‌ها","D":"رشد قیمت در یک روز"}'::jsonb,
   2, 'C', 'اعتبارسنجی پروژه بر شفافیت، داده قابل بررسی، ساختار توکن و شناخت ریسک تکیه دارد.', TRUE),
  ('83826eb5-39e9-54d5-ba14-4ed6ef7cb0c2', 'fa', 5, 5, 'chart-reading', 'technical-analysis', 'analysis', 4,
   'اگر RSI بالای ۷۰ باشد، برداشت مسئولانه‌تر کدام است؟',
   '{"A":"فروش قطعی در همه شرایط","B":"احتمال اشباع خرید و نیاز به تأییدهای بیشتر","C":"ادامه صعود بدون ریسک","D":"بی‌اهمیت بودن ساختار قیمت"}'::jsonb,
   1, 'B', 'RSI به‌تنهایی سیگنال قطعی نیست و باید همراه با ساختار و زمینه بازار بررسی شود.', TRUE),
  ('0e5d3c03-2b94-5f01-8930-905b71d1555d', 'fa', 6, 6, 'risk-management', 'risk-management', 'calculation', 4,
   'اگر سرمایه تمرینی ۱۰۰۰ دلار و قانون ریسک ۲٪ باشد، حداکثر زیان برنامه‌ریزی‌شده هر معامله چقدر است؟',
   '{"A":"۲۰۰ دلار","B":"۲۰ دلار","C":"۱۰۰ دلار","D":"۵۰ دلار"}'::jsonb,
   1, 'B', 'دو درصد از ۱۰۰۰ دلار برابر ۲۰ دلار است.', TRUE),
  ('c9345cb7-4480-5d55-bb9a-3dc4f656946c', 'fa', 7, 7, 'final-readiness', 'trading-psychology', 'behavior-analysis', 5,
   'اگر بازار به‌شدت افت کند و از قبل برنامه ریسک داشته باشی، حرفه‌ای‌ترین رفتار چیست؟',
   '{"A":"فروش هیجانی همه دارایی","B":"خرید فوری بدون بازبینی","C":"اجرای برنامه ریسک و بازبینی سناریو با داده تازه","D":"نادیده گرفتن زیان"}'::jsonb,
   2, 'C', 'رفتار حرفه‌ای یعنی تصمیم بر اساس برنامه و شواهد، نه ترس یا طمع.', TRUE),

  ('e8cc4a5d-d029-588d-a75b-0d533e829e38', 'en', 1, 1, 'safe-entry', 'market-basics', 'risk-awareness', 2,
   'If you are new to crypto markets, what is the most responsible first step?',
   '{"A":"Commit all available capital","B":"Learn the fundamentals and practice without financial risk","C":"Follow an anonymous signal channel","D":"Buy any asset during a sharp rally"}'::jsonb,
   1, 'B', 'A safer entry starts with learning, practice, and explicit risk management.', TRUE),
  ('e4eb5f41-c8ec-509d-b1c2-6862b54324d7', 'en', 2, 2, 'wallet-security', 'security', 'decision-making', 3,
   'Someone asks for your wallet Seed Phrase to help solve a problem. What is the best response?',
   '{"A":"Send it immediately","B":"Send only part of it","C":"Never share it and verify the issue through an official channel","D":"Send a screenshot instead"}'::jsonb,
   2, 'C', 'A Seed Phrase controls the wallet and must never be disclosed to another person or service.', TRUE),
  ('1ab1003e-e6f0-5984-8805-7c52e8434d6c', 'en', 3, 3, 'spot-orders', 'exchange-orders', 'market-structure', 3,
   'When is a Limit order generally more appropriate in a spot market?',
   '{"A":"When you want to control the execution price","B":"When execution at any available price is the only goal","C":"When entering without analysis","D":"When fees do not matter"}'::jsonb,
   0, 'A', 'A Limit order controls the acceptable price, although execution is not guaranteed.', TRUE),
  ('5fe06a69-2a8c-5369-ba7c-f90f1d96aa63', 'en', 4, 4, 'project-research', 'project-validation', 'critical-thinking', 4,
   'Which signal is more meaningful when evaluating the credibility of a crypto project?',
   '{"A":"A guaranteed-profit claim","B":"Heavy influencer promotion","C":"Transparent team, tokenomics, documentation, and disclosed risks","D":"A one-day price surge"}'::jsonb,
   2, 'C', 'Credibility assessment should rely on verifiable information, structure, and explicit risk analysis.', TRUE),
  ('a22b846b-d7f5-5515-85e2-c877c2d2ca61', 'en', 5, 5, 'chart-reading', 'technical-analysis', 'analysis', 4,
   'If RSI is above 70, which interpretation is more responsible?',
   '{"A":"It is always an immediate sell signal","B":"It may indicate overbought conditions and needs confirmation from other evidence","C":"The uptrend is risk-free","D":"Price structure no longer matters"}'::jsonb,
   1, 'B', 'No single indicator is conclusive; RSI should be interpreted with market structure and context.', TRUE),
  ('efa21f3e-0934-513a-9f62-42f8c785fcfd', 'en', 6, 6, 'risk-management', 'risk-management', 'calculation', 4,
   'With a $1,000 practice account and a 2% risk rule, what is the maximum planned loss per trade?',
   '{"A":"$200","B":"$20","C":"$100","D":"$50"}'::jsonb,
   1, 'B', 'Two percent of $1,000 is $20.', TRUE),
  ('d4a283e7-f425-50d3-879b-c73029ca782d', 'en', 7, 7, 'final-readiness', 'trading-psychology', 'behavior-analysis', 5,
   'If the market falls sharply and you already have a risk plan, what is the most professional response?',
   '{"A":"Sell everything emotionally","B":"Buy immediately without review","C":"Follow the risk plan and reassess the scenario using current evidence","D":"Ignore the loss"}'::jsonb,
   2, 'C', 'Professional behavior follows a defined plan and updated evidence rather than fear or greed.', TRUE)
ON CONFLICT (id) DO UPDATE SET
  locale = EXCLUDED.locale,
  term_number = EXCLUDED.term_number,
  lesson_index = EXCLUDED.lesson_index,
  lesson_slug = EXCLUDED.lesson_slug,
  topic = EXCLUDED.topic,
  cognitive_skill = EXCLUDED.cognitive_skill,
  difficulty = EXCLUDED.difficulty,
  question = EXCLUDED.question,
  options = EXCLUDED.options,
  correct_index = EXCLUDED.correct_index,
  correct_option = EXCLUDED.correct_option,
  explanation = EXCLUDED.explanation,
  approved = TRUE,
  updated_at = NOW();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyQuestionBankBaselineMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_QUESTION_BANK_BASELINE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-question-bank-baseline] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_QUESTION_BANK_BASELINE_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
