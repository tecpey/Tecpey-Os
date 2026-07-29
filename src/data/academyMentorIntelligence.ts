export type MentorMode = "beginner" | "intermediate" | "professional" | "risk" | "psychology";

export type MentorProfile = {
  id: MentorMode;
  titleFa: string;
  titleEn: string;
  roleFa: string;
  roleEn: string;
  toneFa: string;
  toneEn: string;
  bestForFa: string[];
  bestForEn: string[];
};

export type MentorWeaknessRule = {
  id: string;
  pattern: string;
  labelFa: string;
  labelEn: string;
  recommendedFa: string;
  recommendedEn: string;
  hrefFa: string;
  hrefEn: string;
};

export const mentorProfiles: MentorProfile[] = [
  {
    id: "beginner",
    titleFa: "مربی شروع امن",
    titleEn: "Safe Start Coach",
    roleFa: "برای کاربری که هنوز با بلاکچین، کیف پول و صرافی آشنا نیست.",
    roleEn: "For users who are new to blockchain, wallets and exchanges.",
    toneFa: "آرام، ساده، بدون اصطلاحات سنگین و همراه با مثال روزمره.",
    toneEn: "Calm, plain-language, low-jargon and example-based.",
    bestForFa: ["تعریف مفاهیم پایه", "شروع ترم ۱", "رفع ترس از ورود اولیه"],
    bestForEn: ["Core definitions", "Term 1 onboarding", "Reducing beginner confusion"],
  },
  {
    id: "intermediate",
    titleFa: "مربی مسیر تحلیلی",
    titleEn: "Analytical Learning Coach",
    roleFa: "برای کاربری که مفاهیم پایه را می‌داند و حالا می‌خواهد پروژه، نمودار و سفارش را بهتر بفهمد.",
    roleEn: "For users who know the basics and want to understand projects, charts and order types.",
    toneFa: "ساختارمند، مقایسه‌ای و همراه با چک‌لیست تصمیم‌گیری.",
    toneEn: "Structured, comparative and checklist-driven.",
    bestForFa: ["تحلیل پروژه", "تحلیل تکنیکال مقدماتی", "مقایسه گزینه‌ها"],
    bestForEn: ["Project analysis", "Technical basics", "Comparing alternatives"],
  },
  {
    id: "professional",
    titleFa: "مربی تصمیم حرفه‌ای",
    titleEn: "Professional Decision Coach",
    roleFa: "برای کاربری که می‌خواهد تصمیم‌ها را با سناریو، ریسک و نقطه ابطال بررسی کند.",
    roleEn: "For users who want to evaluate decisions through scenarios, risk and invalidation points.",
    toneFa: "دقیق، سختگیر، سناریومحور و بدون هیجان.",
    toneEn: "Precise, strict, scenario-based and non-hype.",
    bestForFa: ["سناریوی معامله", "ریسک/ریوارد", "تمرین نهایی"],
    bestForEn: ["Trade scenarios", "Risk/reward", "Final practice"],
  },
  {
    id: "risk",
    titleFa: "مدیر ریسک شخصی",
    titleEn: "Personal Risk Manager",
    roleFa: "برای وقتی که کاربر درباره مقدار سرمایه، حد ضرر، اهرم یا ترس از زیان سؤال دارد.",
    roleEn: "For questions about capital size, stop loss, leverage or fear of loss.",
    toneFa: "محافظ سرمایه، سختگیر و ضد تصمیم عجولانه.",
    toneEn: "Capital-protective, strict and anti-impulsive.",
    bestForFa: ["Position Size", "Stop Loss", "Drawdown", "قانون توقف"],
    bestForEn: ["Position size", "Stop loss", "Drawdown", "Stop rules"],
  },
  {
    id: "psychology",
    titleFa: "مربی روانشناسی بازار",
    titleEn: "Market Psychology Coach",
    roleFa: "برای مدیریت FOMO، انتقام از بازار، ترس، طمع و تصمیم‌های هیجانی.",
    roleEn: "For FOMO, revenge trading, fear, greed and emotional decisions.",
    toneFa: "آرام، بازتابی، رفتاری و ژورنال‌محور.",
    toneEn: "Calm, reflective, behavioral and journaling-oriented.",
    bestForFa: ["FOMO", "معامله انتقامی", "ژورنال", "توقف بعد از ضرر"],
    bestForEn: ["FOMO", "Revenge trading", "Journaling", "Post-loss pause"],
  },
];

export const mentorWeaknessRules: MentorWeaknessRule[] = [
  { id: "security", pattern: "seed|phrase|wallet|کیف|فیشینگ|هک|2fa|امن", labelFa: "امنیت دارایی", labelEn: "Asset security", recommendedFa: "ترم ۲ را مرور کن و چک‌لیست Seed Phrase، 2FA و فیشینگ را کامل کن.", recommendedEn: "Review Term 2 and complete the seed phrase, 2FA and phishing checklist.", hrefFa: "/academy/term-2", hrefEn: "/en/academy/term-2" },
  { id: "risk", pattern: "risk|ریسک|ضرر|حد ضرر|سرمایه|position|drawdown|اهرم", labelFa: "مدیریت ریسک", labelEn: "Risk management", recommendedFa: "قبل از ادامه، ترم ۶ و Practice Lab ریسک را انجام بده.", recommendedEn: "Before continuing, complete Term 6 and the risk practice lab.", hrefFa: "/academy/term-6", hrefEn: "/en/academy/term-6" },
  { id: "technical", pattern: "rsi|macd|کندل|نمودار|حمایت|مقاومت|breakout|volume", labelFa: "تحلیل تکنیکال", labelEn: "Technical analysis", recommendedFa: "ترم ۵ را با تمرکز روی روند، حجم و نقطه ابطال مرور کن.", recommendedEn: "Review Term 5 with focus on trend, volume and invalidation.", hrefFa: "/academy/term-5", hrefEn: "/en/academy/term-5" },
  { id: "project", pattern: "fdv|market cap|tokenomics|vesting|whitepaper|پروژه|توکن", labelFa: "تحلیل پروژه", labelEn: "Project analysis", recommendedFa: "ترم ۴ را مرور کن و برای پروژه، پرونده تحقیق بساز.", recommendedEn: "Review Term 4 and build a research file for the project.", hrefFa: "/academy/term-4", hrefEn: "/en/academy/term-4" },
  { id: "psychology", pattern: "fomo|ترس|طمع|انتقام|هیجان|عصبی|panic|greed", labelFa: "روانشناسی بازار", labelEn: "Market psychology", recommendedFa: "ترم ۷ و Psychology Lab را انجام بده و یک ژورنال تصمیم بنویس.", recommendedEn: "Complete Term 7 and the Psychology Lab, then write a decision journal.", hrefFa: "/academy/term-7", hrefEn: "/en/academy/term-7" },
];

export const mentorRoadmapSteps = [
  { id: "diagnose", titleFa: "تشخیص سطح", titleEn: "Diagnose level", textFa: "Mentor ابتدا سطح، ترم‌های گذرانده‌شده، ضعف‌ها و نوع سؤال را می‌سنجد.", textEn: "The mentor reads level, completed terms, weak areas and question type first." },
  { id: "teach", titleFa: "آموزش متناسب", titleEn: "Personalized explanation", textFa: "پاسخ با زبان ساده یا حرفه‌ای، متناسب با حالت کاربر ساخته می‌شود.", textEn: "The answer adapts to beginner, intermediate or professional mode." },
  { id: "practice", titleFa: "تمرین و سناریو", titleEn: "Practice and scenario", textFa: "بعد از پاسخ، کاربر یک چک‌لیست یا تمرین کوچک دریافت می‌کند.", textEn: "After the answer, the user receives a checklist or small practice task." },
  { id: "recommend", titleFa: "پیشنهاد مسیر بعدی", titleEn: "Next learning step", textFa: "Mentor درس، ترم یا Lab مرتبط را برای رفع ضعف پیشنهاد می‌دهد.", textEn: "The mentor recommends the right lesson, term or lab to address the weakness." },
];
