// Shared, deterministic brain for the TecPey AI Mentor.
//
// The mentor experience (AiMentorExperience) calls a live /api/ai-mentor
// endpoint but always falls back to this deterministic, guard-railed core when
// the network or model is unavailable — so a learner never gets a broken or
// unsafe answer. Extracting the core here makes it a single source of truth that
// other surfaces (e.g. the news-quiz board) can reuse to give the *same*
// risk-first coaching, and keeps it pure (no React, no window, no I/O) so its
// safety can be unit-tested in isolation.
//
// Pedagogy is TecPey's risk-first stance: the mentor teaches process, security
// and risk — never price predictions, buy/sell signals or profit promises. The
// prohibited-claim gate that guards the news-quiz generator also guards this
// module's content in tests, so the mentor can never regress into hype.

export type MentorMode = "concept" | "security" | "risk" | "trading" | "project" | "psychology";
export type MentorLocale = "fa" | "en";

export type MentorReply = {
  ok?: boolean;
  answer: string;
  isReady?: boolean;
  mode?: string;
  relatedTerm?: { number: number; title: string; href: string };
  checklist?: string[];
  suggestedQuestions?: string[];
  sourceLessons?: { title: string; href: string }[];
  sources?: { title: string | null; url: string }[];
  researchMode?: "off" | "public" | "public_blocked";
  threadId?: string | null;
};

/** One mode's curated coaching. All copy is education-first and hype-free. */
type MentorKnowledge = {
  title: string;
  body: [string, string];
  checklist: [string, string, string, string];
  next: string;
  /** Term number 1-7; the locale decides the /academy vs /en/academy prefix. */
  term: number;
};

export const MENTOR_QUICK_QUESTIONS: Record<MentorLocale, string[]> = {
  fa: [
    "Seed Phrase را گم کنم چه می‌شود؟",
    "اگر RSI روی ۸۲ باشد یعنی باید بفروشم؟",
    "فرق Market Cap و FDV چیست؟",
    "با ۱۰۰ میلیون چطور ریسک را کنترل کنم؟",
    "چطور بفهمم یک پروژه کلاهبرداری نیست؟",
    "اگر از ضرر عصبانی شدم چه کنم؟",
  ],
  en: [
    "What happens if I lose my Seed Phrase?",
    "If RSI is at 82, does that mean I should sell?",
    "What is the difference between Market Cap and FDV?",
    "How do I control risk on a small budget?",
    "How can I tell if a project is a scam?",
    "What should I do if a loss makes me angry?",
  ],
};

function termHref(locale: MentorLocale, term: number): string {
  return locale === "fa" ? `/academy/term-${term}` : `/en/academy/term-${term}`;
}
// Keyword detection is intentionally bilingual: the same signal words (English
// tickers/terms and their Persian equivalents) route a question to the right
// coaching mode regardless of the language it was asked in.
export function detectMentorMode(text: string): MentorMode {
  const q = String(text ?? "").toLowerCase();
  if (/seed|phrase|فیشینگ|phishing|کیف پول|wallet|رمز|2fa|هک|hack|امن|secur/.test(q)) return "security";
  if (/risk|ریسک|حد ضرر|stop.?loss|سرمایه|position|سایز|siz|drawdown|ضرر|loss/.test(q)) return "risk";
  if (/rsi|macd|candle|کندل|حمایت|مقاومت|support|resistance|نمودار|chart|تحلیل تکنیکال|breakout/.test(q)) return "trading";
  if (/fdv|market ?cap|توکنومیکس|tokenomics|پروژه|project|whitepaper|vesting|tvl/.test(q)) return "project";
  if (/fomo|ترس|fear|طمع|greed|انتقامی|revenge|هیجان|روانشناسی|psycholog|psycholog|عصب|emotion/.test(q)) return "psychology";
  return "concept";
}

export const MENTOR_KNOWLEDGE: Record<MentorLocale, Record<MentorMode, MentorKnowledge>> = {
  fa: {
    concept: {
      title: "توضیح مفهومی، ساده و بدون هیجان",
      body: [
        "اول مفهوم را از تصمیم مالی جدا کنیم. دانستن یک مفهوم یعنی بتوانی آن را با مثال توضیح بدهی، ریسک‌هایش را نام ببری و بدانی در چه موقعیتی نباید عجله کنی.",
        "در آکادمی تک‌پی، پاسخ آموزشی جایگزین تحقیق شخصی یا توصیه خرید و فروش نیست؛ هدف این است که قبل از اقدام، سؤال‌های درست‌تری بپرسی.",
      ],
      checklist: ["تعریف ساده را بنویس", "مثال واقعی پیدا کن", "ریسک اصلی را مشخص کن", "درس مرتبط را مرور کن"],
      next: "برای شروع بهتر است ترم مبانی رمزارز را مرور کنی.",
      term: 1,
    },
    security: {
      title: "امنیت قبل از هر معامله",
      body: [
        "در امنیت رمزارز، خطاها گاهی برگشت‌پذیر نیستند. اگر Seed Phrase لو برود، کسی که آن را دارد می‌تواند دارایی کیف پول غیرامانی را منتقل کند. اگر گم شود، ممکن است خودت هم دیگر به دارایی دسترسی نداشته باشی.",
        "هیچ پشتیبان، مدرس یا دستیار هوشمندی نباید Seed Phrase، کد 2FA یا رمز ورود تو را بخواهد. هر درخواستی از این جنس یک هشدار جدی است.",
      ],
      checklist: ["Seed را آنلاین ذخیره نکن", "دامنه رسمی را خودت تایپ کن", "2FA را فعال کن", "قبل از برداشت شبکه و آدرس را چک کن"],
      next: "برای پاسخ کامل‌تر، ترم امنیت دارایی را ببین.",
      term: 2,
    },
    risk: {
      title: "اول اندازه ریسک، بعد فکر کردن به بازده",
      body: [
        "اگر درباره مقدار سرمایه می‌پرسی، پاسخ حرفه‌ای یک عدد ثابت نیست. اول باید بدانی اگر تحلیل اشتباه شد، حداکثر چه مقدار از کل سرمایه‌ات آسیب می‌بیند و آیا این آسیب برای زندگی مالی تو قابل تحمل است یا نه.",
        "اصل آموزشی تک‌پی این است: هیچ معامله‌ای نباید آن‌قدر بزرگ باشد که یک اشتباه، مسیر یادگیری و آرامش مالی تو را نابود کند.",
      ],
      checklist: ["کل سرمایه را مشخص کن", "درصد ریسک هر تصمیم را محدود کن", "حد ضرر یا نقطه ابطال بنویس", "بعد از ضرر قانون توقف داشته باش"],
      next: "ترم مدیریت سرمایه برای همین سؤال طراحی شده است.",
      term: 6,
    },
    trading: {
      title: "تحلیل تکنیکال یعنی احتمال، نه دستور قطعی",
      body: [
        "RSI، MACD، حمایت و مقاومت ابزار تصمیم‌سازی هستند، نه دکمه خرید و فروش. مثلاً RSI بالا می‌تواند هشدار داغ شدن قیمت باشد، اما در روند قوی ممکن است مدت‌ها بالا بماند.",
        "قبل از هر تصمیم باید روند، حجم، ناحیه قیمتی، سناریوی شکست و نقطه ابطال را کنار هم ببینی.",
      ],
      checklist: ["روند اصلی را مشخص کن", "حجم را بررسی کن", "سطح ابطال تحلیل را بنویس", "ریسک/ریوارد را حساب کن"],
      next: "ترم تحلیل تکنیکال کاربردی را ادامه بده.",
      term: 5,
    },
    project: {
      title: "قبل از اعتماد به پروژه، پرونده بساز",
      body: [
        "برای بررسی پروژه فقط قیمت یا تبلیغ کافی نیست. باید کاربرد واقعی، تیم، وایت‌پیپر، اقتصاد توکن، FDV، زمان آزادسازی توکن‌ها، نقدشوندگی و Red Flagها را ببینی.",
        "اگر پروژه بازدهیِ بی‌ریسک یا نتیجهٔ قطعی تبلیغ می‌کند، قرارداد فروش را محدود کرده، نقدشوندگی کمی دارد یا توکن‌ها در چند کیف پول متمرکزند، باید بسیار محتاط باشی.",
      ],
      checklist: ["کاربرد واقعی را توضیح بده", "FDV و Vesting را بررسی کن", "نقدشوندگی را ببین", "سه دلیل مخالف خرید بنویس"],
      next: "ترم تحلیل پروژه و توکنومیکس دقیقاً برای همین ساخته شده است.",
      term: 4,
    },
    psychology: {
      title: "ذهن آرام بخشی از امنیت سرمایه است",
      body: [
        "FOMO، ترس، طمع و معامله انتقامی می‌توانند حتی با دانش خوب، تصمیم بد بسازند. بعد از ضرر، ذهن معمولاً دنبال جبران فوری است؛ این لحظه خطرناک است.",
        "پاسخ حرفه‌ای به هیجان، معامله بیشتر نیست؛ توقف، نوشتن ژورنال و برگشتن به چک‌لیست است.",
      ],
      checklist: ["۱۰ دقیقه مکث کن", "احساس فعلی را بنویس", "قانون توقف را اجرا کن", "بدون چک‌لیست وارد نشو"],
      next: "ترم روانشناسی بازار و آمادگی نهایی را مرور کن.",
      term: 7,
    },
  },
  en: {
    concept: {
      title: "A simple, calm explanation of the concept",
      body: [
        "First separate the concept from the money decision. Knowing a concept means you can explain it with an example, name its risks and recognise when not to rush.",
        "In the TecPey Academy an educational answer never replaces your own research or a buy/sell decision; the goal is to help you ask better questions before you act.",
      ],
      checklist: ["Write the plain definition", "Find a real example", "Name the main risk", "Review the related lesson"],
      next: "A good start is to review the crypto fundamentals term.",
      term: 1,
    },
    security: {
      title: "Security comes before any trade",
      body: [
        "In crypto security some mistakes are not reversible. If a Seed Phrase leaks, whoever holds it can move the assets of a non-custodial wallet. If it is lost, you may lose access yourself.",
        "No support agent, instructor or assistant should ever ask for your Seed Phrase, 2FA code or password. Any such request is a serious warning sign.",
      ],
      checklist: ["Never store the seed online", "Type the official domain yourself", "Enable 2FA", "Check network and address before withdrawing"],
      next: "For a fuller answer, see the asset-security term.",
      term: 2,
    },
    risk: {
      title: "Size the risk first, weigh the upside second",
      body: [
        "If you are asking how much to invest, the professional answer is not a fixed number. First understand how much of your total capital is hurt if the analysis is wrong, and whether that damage is bearable for your financial life.",
        "TecPey's teaching principle: no single trade should be large enough that one mistake destroys your learning path and financial peace of mind.",
      ],
      checklist: ["Define your total capital", "Cap the risk per decision", "Write a stop or invalidation point", "Keep a stop rule after a loss"],
      next: "The money-management term is built for exactly this question.",
      term: 6,
    },
    trading: {
      title: "Technical analysis is probability, not a command",
      body: [
        "RSI, MACD, support and resistance are decision tools, not buy/sell buttons. A high RSI can warn that price is overheated, yet in a strong trend it can stay high for a long time.",
        "Before any decision, look at trend, volume, price zone, the break scenario and the invalidation point together.",
      ],
      checklist: ["Identify the main trend", "Check the volume", "Write the analysis-invalidation level", "Compute risk/reward"],
      next: "Continue with the applied technical-analysis term.",
      term: 5,
    },
    project: {
      title: "Build a case file before trusting a project",
      body: [
        "Reviewing a project takes more than price or marketing. Look at real utility, the team, the whitepaper, token economics, FDV, token-unlock timing, liquidity and red flags.",
        "Be very cautious if a project advertises risk-free or certain returns, restricts selling, has thin liquidity, or concentrates tokens in a few wallets.",
      ],
      checklist: ["Explain the real utility", "Review FDV and vesting", "Check liquidity", "Write three reasons against buying"],
      next: "The project-analysis and tokenomics term is made for this.",
      term: 4,
    },
    psychology: {
      title: "A calm mind is part of protecting your capital",
      body: [
        "FOMO, fear, greed and revenge trading can turn good knowledge into bad decisions. After a loss the mind usually seeks instant recovery; that moment is dangerous.",
        "The professional response to emotion is not more trading; it is stopping, journalling and returning to your checklist.",
      ],
      checklist: ["Pause for 10 minutes", "Write down the current feeling", "Apply your stop rule", "Do not enter without a checklist"],
      next: "Review the market-psychology and final-readiness term.",
      term: 7,
    },
  },
};

export type MentorCoaching = {
  mode: MentorMode;
  title: string;
  summary: string;
  checklist: string[];
  lesson: { title: string; href: string };
};

/**
 * Deterministic, guard-railed coaching for a learner's question or a news
 * subject. The returned copy is entirely curated (keyed by detected mode) — no
 * caller text is echoed back — so it can never surface hype or a prediction.
 */
export function buildMentorCoaching(text: string, locale: MentorLocale): MentorCoaching {
  const mode = detectMentorMode(text);
  const knowledge = MENTOR_KNOWLEDGE[locale][mode];
  return {
    mode,
    title: knowledge.title,
    summary: knowledge.body[0],
    checklist: [...knowledge.checklist],
    lesson: { title: knowledge.next, href: termHref(locale, knowledge.term) },
  };
}

/** The deterministic fallback reply used by the live mentor experience. */
export function toLocalReply(question: string, locale: MentorLocale = "fa"): MentorReply {
  const mode = detectMentorMode(question);
  const knowledge = MENTOR_KNOWLEDGE[locale][mode];
  return {
    answer: `${knowledge.title}\n\n${knowledge.body.join("\n\n")}`,
    isReady: false,
    mode: "guided",
    relatedTerm: { number: knowledge.term, title: knowledge.next, href: termHref(locale, knowledge.term) },
    checklist: [...knowledge.checklist],
    suggestedQuestions: MENTOR_QUICK_QUESTIONS[locale].slice(0, 3),
    sourceLessons: [{ title: knowledge.next, href: termHref(locale, knowledge.term) }],
  };
}
