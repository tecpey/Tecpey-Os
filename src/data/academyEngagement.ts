export type AcademyMission = {
  id: string;
  term: number;
  xp: number;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
  hrefFa: string;
  hrefEn: string;
};

export type AcademyAchievement = {
  id: string;
  xp: number;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
};

export const tecpeyLearningMethodFa = [
  { step: "Understand", title: "بفهم", text: "قبل از هر اقدام، مفهوم را با مثال ساده و ریسک اصلی آن یاد بگیر." },
  { step: "Practice", title: "تمرین کن", text: "با چک‌لیست، کوییز و سؤال‌های عملی، دانش را از حفظیات جدا کن." },
  { step: "Simulate", title: "شبیه‌سازی کن", text: "در Practice Lab تصمیم بگیر و بدون ریسک واقعی بازخورد دریافت کن." },
  { step: "Challenge", title: "خودت را بسنج", text: "با سناریوهای سخت، اشتباهات رفتاری و نقاط ضعف خودت را پیدا کن." },
  { step: "Trade Safely", title: "مسئولانه وارد شو", text: "فقط وقتی چک‌لیست دانش، امنیت، ریسک و روانشناسی کامل شد اقدام کن." },
];

export const tecpeyLearningMethodEn = [
  { step: "Understand", title: "Understand", text: "Learn the concept, a plain example and the main risk before taking action." },
  { step: "Practice", title: "Practice", text: "Use checklists, quizzes and practical questions to turn reading into ability." },
  { step: "Simulate", title: "Simulate", text: "Make scenario decisions in the Practice Lab and get feedback without real capital risk." },
  { step: "Challenge", title: "Challenge", text: "Test yourself with difficult cases and identify behavioral weaknesses." },
  { step: "Trade Safely", title: "Trade safely", text: "Act only after knowledge, security, risk and psychology checklists are clear." },
];

export const academyMissions: AcademyMission[] = [
  { id: "start-foundations", term: 1, xp: 120, titleFa: "شروع امن از مبانی", titleEn: "Start with foundations", descriptionFa: "ترم ۱ را بخوان و تفاوت قیمت، ارزش بازار، نقدشوندگی و ریسک را با مثال توضیح بده.", descriptionEn: "Study Term 1 and explain price, market cap, liquidity and risk with examples.", hrefFa: "/academy/term-1", hrefEn: "/en/academy/term-1" },
  { id: "security-checklist", term: 2, xp: 140, titleFa: "چک‌لیست امنیت دارایی", titleEn: "Asset security checklist", descriptionFa: "قبل از هر برداشت، شبکه، آدرس، 2FA و دامنه رسمی را چک کن و یک سناریوی فیشینگ را تحلیل کن.", descriptionEn: "Before transfers, verify network, address, 2FA and official domain, then analyze a phishing scenario.", hrefFa: "/academy/term-2", hrefEn: "/en/academy/term-2" },
  { id: "order-practice", term: 3, xp: 150, titleFa: "تمرین سفارش بدون سرمایه واقعی", titleEn: "Order practice without real capital", descriptionFa: "یک سفارش Market و یک سفارش Limit فرضی بساز و دلیل انتخاب هرکدام را بنویس.", descriptionEn: "Create one hypothetical Market and one Limit order and explain when each is appropriate.", hrefFa: "/academy/term-3", hrefEn: "/en/academy/term-3" },
  { id: "project-file", term: 4, xp: 170, titleFa: "پرونده تحلیل پروژه", titleEn: "Project research file", descriptionFa: "برای یک پروژه فرضی کاربرد، تیم، Tokenomics، FDV، Vesting و سه Red Flag را بنویس.", descriptionEn: "Build a project file with use case, team, tokenomics, FDV, vesting and three red flags.", hrefFa: "/academy/term-4", hrefEn: "/en/academy/term-4" },
  { id: "chart-risk", term: 5, xp: 180, titleFa: "تحلیل نمودار با نقطه ابطال", titleEn: "Chart analysis with invalidation", descriptionFa: "روی یک سناریو روند، سطح مهم، حجم، RSI و نقطه ابطال تحلیل را مشخص کن.", descriptionEn: "Mark trend, key level, volume, RSI and invalidation point on a scenario.", hrefFa: "/academy/practice-lab", hrefEn: "/en/academy/practice-lab" },
  { id: "risk-plan", term: 6, xp: 200, titleFa: "برنامه مدیریت ریسک", titleEn: "Risk management plan", descriptionFa: "برای سرمایه فرضی، حداکثر ریسک هر تصمیم، قانون توقف و اندازه موقعیت را تعریف کن.", descriptionEn: "Define max risk per decision, stop rule and position size for a sample balance.", hrefFa: "/academy/term-6", hrefEn: "/en/academy/term-6" },
  { id: "psychology-journal", term: 7, xp: 220, titleFa: "ژورنال روانشناسی معامله", titleEn: "Trading psychology journal", descriptionFa: "یک تصمیم هیجانی فرضی را با احساس، دلیل، ریسک، نقطه توقف و درس آموخته‌شده ثبت کن.", descriptionEn: "Journal a hypothetical emotional decision with feeling, reason, risk, stop point and lesson learned.", hrefFa: "/academy/term-7", hrefEn: "/en/academy/term-7" },
];

export const academyAchievements: AcademyAchievement[] = [
  { id: "safe-starter", xp: 100, titleFa: "شروع امن", titleEn: "Safe Starter", descriptionFa: "اولین درس را شروع کردی و مسیر را از آموزش، نه هیجان، آغاز کردی.", descriptionEn: "You started with education, not market excitement." },
  { id: "security-guardian", xp: 260, titleFa: "محافظ امنیت", titleEn: "Security Guardian", descriptionFa: "مفاهیم Seed Phrase، 2FA، فیشینگ و انتقال امن را مرور کردی.", descriptionEn: "You reviewed seed phrase, 2FA, phishing and safe transfers." },
  { id: "risk-controller", xp: 520, titleFa: "کنترل‌گر ریسک", titleEn: "Risk Controller", descriptionFa: "قبل از فکر کردن به سود، اندازه زیان قابل تحمل را می‌سنجی.", descriptionEn: "You check acceptable loss before thinking about profit." },
  { id: "scenario-ready", xp: 760, titleFa: "آماده سناریو", titleEn: "Scenario Ready", descriptionFa: "تصمیم‌های تمرینی را با چک‌لیست، بازخورد و اصلاح رفتاری بررسی کردی.", descriptionEn: "You evaluated practice decisions with checklists and feedback." },
  { id: "tecpey-graduate", xp: 1100, titleFa: "فارغ‌التحصیل مسئول", titleEn: "Responsible Graduate", descriptionFa: "دانش، امنیت، تحلیل، ریسک و روانشناسی را در مسیر نهایی کنار هم گذاشتی.", descriptionEn: "You connected knowledge, security, research, risk and psychology." },
];
