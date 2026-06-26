export type AcademySpecializedTrack = {
  id: string;
  titleFa: string;
  titleEn: string;
  formatFa: string;
  formatEn: string;
  durationFa: string;
  durationEn: string;
  outcomeFa: string;
  outcomeEn: string;
  prerequisitesFa: string[];
  prerequisitesEn: string[];
  modulesFa: string[];
  modulesEn: string[];
};

export const academySpecializedTracks: AcademySpecializedTrack[] = [
  {
    id: "risk-first-trading",
    titleFa: "مسیر تخصصی معامله‌گری ریسک‌محور",
    titleEn: "Risk-first trading specialization",
    formatFa: "آنلاین زنده یا حضوری سطح بالا + تمرین هفتگی + بازخورد Mentor",
    formatEn: "Live online + weekly practice + mentor feedback",
    durationFa: "۶ هفته",
    durationEn: "6 weeks",
    outcomeFa: "ساخت پلن معامله شخصی، کارنامه تمرینی و ورود به لیست بررسی استعدادهای واجد شرایط برای مسیر همکاری یا سرمایه تمرینی/معاملاتی آینده تک‌پی.",
    outcomeEn: "Build a personal trading plan with stop rules, position sizing, journaling and risk limits.",
    prerequisitesFa: ["تکمیل ۷ ترم پایه", "قبولی در ارزیابی نهایی", "ثبت ژورنال حداقل ۳ سناریوی Practice Lab", "پذیرش ارزیابی انسانی/داده‌ای برای مسیر حرفه‌ای"],
    prerequisitesEn: ["Complete the 7-term foundation path", "Pass the final assessment", "Journal at least 3 Practice Lab scenarios"],
    modulesFa: ["طراحی پلن معامله", "مدیریت ریسک و Drawdown", "خطاهای رایج RSI و شکست جعلی", "تمرین روی سناریوهای بازار", "بازبینی ژورنال", "آمادگی مسیر شغلی/همکاری مشروط"],
    modulesEn: ["Trading plan design", "Risk and drawdown control", "RSI traps and fake breakouts", "Scenario practice", "Journal review"],
  },
  {
    id: "security-operations",
    titleFa: "مسیر تخصصی امنیت دارایی و عملیات کاربر",
    titleEn: "Asset security and user operations specialization",
    formatFa: "حضوری یا آنلاین گروهی + چک‌لیست عملی",
    formatEn: "In-person or cohort online + practical checklist",
    durationFa: "۴ هفته",
    durationEn: "4 weeks",
    outcomeFa: "ساخت روال امنیتی شخصی برای کیف پول، صرافی، انتقال، 2FA، فیشینگ و بکاپ امن.",
    outcomeEn: "Create a personal security operating routine for wallets, exchanges, transfers, 2FA, phishing and backup.",
    prerequisitesFa: ["تکمیل ترم امنیت", "توانایی توضیح Seed Phrase و Private Key", "قبولی در چک‌لیست امنیت"],
    prerequisitesEn: ["Complete the security term", "Explain seed phrase and private key correctly", "Pass the security checklist"],
    modulesFa: ["امنیت حساب و دستگاه", "سناریوهای فیشینگ", "انتقال امن بین شبکه‌ها", "چک‌لیست قبل از برداشت", "برنامه بکاپ و بازیابی"],
    modulesEn: ["Account and device security", "Phishing scenarios", "Safe cross-network transfers", "Withdrawal checklist", "Backup and recovery plan"],
  },
  {
    id: "portfolio-builder",
    titleFa: "مسیر تخصصی ساخت سبد مسئولانه",
    titleEn: "Responsible portfolio building specialization",
    formatFa: "کارگاه آنلاین + پرونده پروژه + تمرین سبد فرضی",
    formatEn: "Online workshop + project file + sample portfolio practice",
    durationFa: "۵ هفته",
    durationEn: "5 weeks",
    outcomeFa: "یادگیری ساخت سبد فرضی بر اساس نقدشوندگی، ریسک پروژه، افق زمانی، استیبل‌کوین و سناریوی خروج.",
    outcomeEn: "Learn to build a sample portfolio using liquidity, project risk, time horizon, stablecoin allocation and exit scenarios.",
    prerequisitesFa: ["تکمیل ترم تحلیل پروژه", "توانایی ساخت پرونده پروژه", "درک Market Cap، FDV و Vesting"],
    prerequisitesEn: ["Complete project analysis term", "Create a project research file", "Understand market cap, FDV and vesting"],
    modulesFa: ["چارچوب بررسی پروژه", "ریسک نقدشوندگی", "تقسیم سرمایه فرضی", "سناریوی بازار نزولی", "بازبینی سبد"],
    modulesEn: ["Project review framework", "Liquidity risk", "Sample allocation", "Bear market scenario", "Portfolio review"],
  },
];

export const specializedProgramCriteriaFa = [
  "تکمیل تمام ۷ ترم پایه آکادمی تک‌پی",
  "انجام حداقل ۳ تمرین در Practice Lab یا Simulation World",
  "شناخت Seed Phrase، فیشینگ، مدیریت ریسک و نقطه ابطال",
  "پذیرش این اصل که آکادمی وعده سود یا سیگنال معاملاتی ارائه نمی‌کند",
  "درک اینکه سرمایه اولیه، موقعیت شغلی یا همکاری فقط برای افراد واجد شرایط و پس از بررسی دوره تخصصی مطرح می‌شود",
];

export const specializedProgramCriteriaEn = [
  "Complete all 7 TecPey Academy foundation terms",
  "Finish at least 3 Practice Lab or Simulation World exercises",
  "Understand seed phrase, phishing, risk management and invalidation",
  "Accept that the Academy does not provide profit promises or trading signals",
];
