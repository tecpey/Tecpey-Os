export type AcademyScenario = {
  slug: string;
  term: number;
  titleFa: string;
  titleEn: string;
  contextFa: string;
  contextEn: string;
  marketStateFa: string[];
  marketStateEn: string[];
  choicesFa: { label: string; score: number; feedback: string }[];
  choicesEn: { label: string; score: number; feedback: string }[];
  mentorPromptFa: string;
  mentorPromptEn: string;
  lessonHrefFa: string;
  lessonHrefEn: string;
};

export const academyScenarioChallenges: AcademyScenario[] = [
  {
    slug: "btc-2022-crash-risk",
    term: 6,
    titleFa: "ریزش بیت‌کوین ۲۰۲۲؛ وقتی RSI پایین هنوز کافی نیست",
    titleEn: "Bitcoin 2022 crash: when low RSI is still not enough",
    contextFa: "بیت‌کوین بعد از یک روند نزولی سنگین به ناحیه‌ای رسیده که بسیاری آن را «ارزان» می‌دانند. RSI پایین است، شبکه‌های اجتماعی پر از امید برگشت قیمت است، اما روند اصلی هنوز نزولی و اخبار اقتصاد کلان منفی است.",
    contextEn: "Bitcoin has dropped sharply and many users call it cheap. RSI is low, social media expects a bounce, but the main trend is still bearish and macro news remains negative.",
    marketStateFa: ["سرمایه فرضی: ۱۰۰۰ USDT", "روند اصلی: نزولی", "RSI: نزدیک اشباع فروش", "هدف تمرین: تصمیم بدون هیجان و با حد ضرر"],
    marketStateEn: ["Sample balance: 1,000 USDT", "Main trend: bearish", "RSI: near oversold", "Goal: decide without emotion and with invalidation"],
    choicesFa: [
      { label: "خرید با کل سرمایه چون RSI پایین است", score: 28, feedback: "ریسک بسیار بالا؛ یک اندیکاتور به‌تنهایی دلیل ورود نیست و کل سرمایه نباید روی یک تصمیم قرار بگیرد." },
      { label: "ورود پله‌ای کوچک همراه با حد ضرر و سناریوی ابطال", score: 88, feedback: "تصمیم مسئولانه‌تر؛ اندازه موقعیت، سناریوی اشتباه بودن تحلیل و حد ضرر مشخص شده است." },
      { label: "صبر تا شکست روند نزولی یا تأیید حجم", score: 82, feedback: "برای کاربر تازه‌کار محافظه‌کارانه و قابل دفاع است؛ فرصت از دست رفتن بهتر از از دست رفتن سرمایه است." },
    ],
    choicesEn: [
      { label: "Buy with all capital because RSI is low", score: 28, feedback: "Very high risk. One indicator is not a complete entry thesis and full allocation is unsafe." },
      { label: "Small staged entry with stop-loss and invalidation plan", score: 88, feedback: "More responsible. Position size, invalidation and risk are defined before acting." },
      { label: "Wait for trend break or volume confirmation", score: 82, feedback: "Defensive and reasonable for beginners. Missing an entry is better than losing discipline." },
    ],
    mentorPromptFa: "این سناریو را با تمرکز روی RSI، روند، حد ضرر و اندازه موقعیت برای من تحلیل کن.",
    mentorPromptEn: "Analyze this scenario through RSI, trend, stop-loss and position sizing.",
    lessonHrefFa: "/academy/term-6",
    lessonHrefEn: "/en/academy/term-6",
  },
  {
    slug: "luna-collapse-fundamental",
    term: 4,
    titleFa: "سقوط لونا؛ وقتی مدل اقتصادی پروژه را نمی‌فهمیم",
    titleEn: "Luna collapse: when users do not understand token design",
    contextFa: "یک پروژه رشد شدیدی داشته، جامعه بزرگی دارد و سودهای تبلیغاتی جذاب مطرح می‌شود. اما مدل پایداری، ریسک Depeg، تمرکز نقدشوندگی و طراحی توکن به‌درستی فهم نشده است.",
    contextEn: "A project has grown fast, has a large community and attractive yield narratives. But its stability model, depeg risk, liquidity concentration and token design are not fully understood.",
    marketStateFa: ["تمرکز تمرین: Tokenomics و Red Flag", "ریسک اصلی: اعتماد کور به سود بالا", "سؤال کلیدی: اگر فرض اصلی پروژه شکست بخورد چه می‌شود؟"],
    marketStateEn: ["Focus: tokenomics and red flags", "Main risk: blind trust in high yield", "Key question: what happens if the core assumption fails?"],
    choicesFa: [
      { label: "ورود چون همه درباره پروژه صحبت می‌کنند", score: 22, feedback: "محبوبیت جایگزین تحلیل نیست. هیجان جمعی می‌تواند آخرین مرحله قبل از ریزش باشد." },
      { label: "ساخت پرونده پروژه شامل کاربرد، ریسک، نقدشوندگی و سناریوی شکست", score: 91, feedback: "این رفتار حرفه‌ای است؛ قبل از سرمایه‌گذاری باید فرضیات پروژه و نقطه شکست آن بررسی شود." },
      { label: "نادیده گرفتن پروژه تا وقتی مدل اقتصادی آن را نفهمیده‌ام", score: 86, feedback: "برای تازه‌کارها تصمیم بسیار سالمی است. نفهمیدن یک پروژه دلیل کافی برای ورود نکردن است." },
    ],
    choicesEn: [
      { label: "Enter because everyone is talking about it", score: 22, feedback: "Popularity is not analysis. Crowd excitement can appear near the most dangerous phase." },
      { label: "Build a project file: use case, risk, liquidity and failure scenario", score: 91, feedback: "Professional behavior. A project’s assumptions and failure points must be checked before allocation." },
      { label: "Avoid until I understand the economic model", score: 86, feedback: "Healthy beginner behavior. Not understanding a project is enough reason not to enter." },
    ],
    mentorPromptFa: "این پروژه فرضی را مثل یک تحلیلگر فاندامنتال بررسی کن و Red Flagها را بگو.",
    mentorPromptEn: "Review this hypothetical project like a fundamental analyst and identify red flags.",
    lessonHrefFa: "/academy/term-4",
    lessonHrefEn: "/en/academy/term-4",
  },
  {
    slug: "phishing-wallet-security",
    term: 2,
    titleFa: "فیشینگ کیف پول؛ لینک جعلی و دارایی واقعی",
    titleEn: "Wallet phishing: fake link, real loss",
    contextFa: "کاربر پیامی دریافت می‌کند که ادعا می‌کند باید برای دریافت ایردراپ، کیف پول خود را به یک سایت وصل کند. ظاهر سایت شبیه پروژه اصلی است، اما دامنه یک حرف اضافه دارد.",
    contextEn: "A user receives a message claiming they must connect a wallet to claim an airdrop. The site looks like the real project, but the domain has one extra character.",
    marketStateFa: ["نوع ریسک: امنیت رفتاری", "دارایی در خطر: کل موجودی کیف پول", "اصل طلایی: اتصال کیف پول یعنی دادن اجازه تعامل"],
    marketStateEn: ["Risk type: behavioral security", "Asset at risk: full wallet balance", "Golden rule: wallet connection can grant permissions"],
    choicesFa: [
      { label: "اتصال سریع کیف پول برای از دست ندادن فرصت", score: 10, feedback: "این دقیقاً الگوی فیشینگ است. فرصت فوری و ترس از جا ماندن ابزار مهاجم است." },
      { label: "بررسی دامنه رسمی، شبکه‌های رسمی و عدم امضای تراکنش مشکوک", score: 96, feedback: "رفتار صحیح؛ قبل از اتصال، منبع، دامنه و نوع اجازه باید بررسی شود." },
      { label: "انتقال همه دارایی به کیف پول تازه قبل از تست سایت", score: 58, feedback: "بهتر از اتصال مستقیم است، اما هنوز تعامل با سایت ناشناس خطرناک است. اصل، تأیید منبع رسمی است." },
    ],
    choicesEn: [
      { label: "Connect quickly before missing the opportunity", score: 10, feedback: "This is the phishing pattern. Urgency and FOMO are attacker tools." },
      { label: "Check official domain, official channels and avoid suspicious signing", score: 96, feedback: "Correct behavior. Source, domain and permission type must be verified before connecting." },
      { label: "Move funds to a fresh wallet before testing the site", score: 58, feedback: "Safer than direct exposure, but interacting with unknown sites remains risky. Verify the official source first." },
    ],
    mentorPromptFa: "این لینک ایردراپ فرضی را از نظر امنیتی تحلیل کن و چک‌لیست تصمیم بده.",
    mentorPromptEn: "Analyze this hypothetical airdrop link from a security perspective and give a checklist.",
    lessonHrefFa: "/academy/term-2",
    lessonHrefEn: "/en/academy/term-2",
  },
];
