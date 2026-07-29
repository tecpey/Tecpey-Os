export type SimulationKind = "trading" | "crash" | "portfolio" | "psychology" | "risk";

export type SimulationChoice = {
  id: string;
  labelFa: string;
  labelEn: string;
  score: number;
  feedbackFa: string;
  feedbackEn: string;
};

export type AcademySimulation = {
  id: string;
  kind: SimulationKind;
  term: number;
  xp: number;
  titleFa: string;
  titleEn: string;
  subtitleFa: string;
  subtitleEn: string;
  marketFa: string[];
  marketEn: string[];
  objectiveFa: string;
  objectiveEn: string;
  choices: SimulationChoice[];
  mentorFa: string;
  mentorEn: string;
  lessonFa: string;
  lessonEn: string;
};

export const simulationKinds: { kind: SimulationKind; titleFa: string; titleEn: string; hrefFa: string; hrefEn: string }[] = [
  { kind: "trading", titleFa: "شبیه‌ساز تصمیم بازار", titleEn: "Trading Decision Simulator", hrefFa: "/academy/simulator", hrefEn: "/en/academy/simulator" },
  { kind: "crash", titleFa: "شبیه‌ساز ریزش بازار", titleEn: "Crash Simulator", hrefFa: "/academy/crash-simulator", hrefEn: "/en/academy/crash-simulator" },
  { kind: "portfolio", titleFa: "آزمایشگاه سبد دارایی", titleEn: "Portfolio Lab", hrefFa: "/academy/portfolio-lab", hrefEn: "/en/academy/portfolio-lab" },
  { kind: "psychology", titleFa: "آزمایشگاه روانشناسی", titleEn: "Psychology Lab", hrefFa: "/academy/psychology-lab", hrefEn: "/en/academy/psychology-lab" },
  { kind: "risk", titleFa: "شبیه‌ساز ریسک", titleEn: "Risk Simulator", hrefFa: "/academy/risk-simulator", hrefEn: "/en/academy/risk-simulator" },
];

export const academySimulations: AcademySimulation[] = [
  {
    id: "btc-breakout-fakeout",
    kind: "trading",
    term: 5,
    xp: 160,
    titleFa: "شکست مقاومت بیت‌کوین؛ ورود یا صبر؟",
    titleEn: "Bitcoin resistance breakout: enter or wait?",
    subtitleFa: "قیمت از مقاومت عبور کرده، اما حجم هنوز ضعیف است. این تمرین یاد می‌دهد شکست ظاهری را با تأیید و نقطه ابطال بررسی کنی.",
    subtitleEn: "Price has moved above resistance, but volume is weak. This scenario trains confirmation, invalidation and fake-breakout thinking.",
    marketFa: ["سرمایه فرضی: ۱۰۰۰ USDT", "روند کوتاه‌مدت: صعودی", "حجم: کمتر از میانگین", "ریسک اصلی: ورود هیجانی بعد از کندل سبز"],
    marketEn: ["Sample balance: 1,000 USDT", "Short-term trend: bullish", "Volume: below average", "Main risk: emotional entry after a green candle"],
    objectiveFa: "تصمیمی بگیر که قبل از ورود، سناریوی شکست تحلیل، حد ضرر و حجم موقعیت را مشخص کند.",
    objectiveEn: "Make a decision that defines invalidation, stop-loss and position size before entry.",
    choices: [
      { id: "all-in", labelFa: "ورود با کل سرمایه چون شکست رخ داده", labelEn: "Enter with all capital because breakout happened", score: 24, feedbackFa: "ورود کامل بدون حجم تأییدی و بدون حد ضرر، تصمیم هیجانی است. شکست می‌تواند Fakeout باشد.", feedbackEn: "Full entry without volume confirmation or stop-loss is emotional. The breakout can be a fakeout." },
      { id: "small-confirmed", labelFa: "ورود کوچک با حد ضرر زیر سطح شکست و انتظار تأیید حجم", labelEn: "Small entry with stop below breakout and volume confirmation", score: 91, feedbackFa: "تصمیم حرفه‌ای‌تر است؛ ریسک محدود، سناریوی ابطال روشن و ورود مرحله‌ای دارد.", feedbackEn: "More professional: limited risk, clear invalidation and staged entry." },
      { id: "wait-retest", labelFa: "صبر برای پولبک یا تثبیت بالای مقاومت", labelEn: "Wait for retest or consolidation above resistance", score: 84, feedbackFa: "برای تازه‌کارها انتخاب سالمی است. فرصت از دست رفته بهتر از ورود بی‌برنامه است.", feedbackEn: "Healthy for beginners. Missing one entry is better than an unplanned trade." },
    ],
    mentorFa: "این سناریو را با تمرکز روی Fake Breakout، حجم، حد ضرر و اندازه موقعیت تحلیل کن.",
    mentorEn: "Analyze this through fake breakout risk, volume, stop-loss and position sizing.",
    lessonFa: "/academy/term-5",
    lessonEn: "/en/academy/term-5",
  },
  {
    id: "panic-crash-12-percent",
    kind: "crash",
    term: 7,
    xp: 190,
    titleFa: "ریزش ۱۲٪ در یک روز؛ واکنش یا برنامه؟",
    titleEn: "12% daily crash: reaction or plan?",
    subtitleFa: "بازار ناگهان سقوط کرده و شبکه‌های اجتماعی پر از ترس است. تمرین برای کنترل ترس، توقف، ژورنال و تصمیم بدون انتقام.",
    subtitleEn: "The market suddenly drops and social media is filled with fear. This trains pause, journaling and non-revenge decisions.",
    marketFa: ["BTC: ۱۰۴٬۰۰۰ → ۹۱٬۵۰۰", "حس غالب: ترس و پشیمانی", "سرمایه فرضی: ۱۰۰۰ USDT", "هدف تمرین: حفظ سرمایه و آرامش"],
    marketEn: ["BTC: 104,000 → 91,500", "Dominant feeling: fear and regret", "Sample balance: 1,000 USDT", "Goal: protect capital and discipline"],
    objectiveFa: "قبل از هر خرید یا فروش، احساس، برنامه ریسک و سناریوی ادامه ریزش را بنویس.",
    objectiveEn: "Before any buy or sell, write your emotion, risk plan and further-drop scenario.",
    choices: [
      { id: "revenge-buy", labelFa: "خرید فوری برای جبران فرصت قبلی", labelEn: "Immediate buy to recover missed opportunity", score: 31, feedbackFa: "این تصمیم بیشتر از ترس و FOMO می‌آید تا تحلیل. در ریزش‌ها اول باید برنامه ریسک نوشته شود.", feedbackEn: "This is driven more by fear and FOMO than analysis. In crashes, risk plan comes first." },
      { id: "panic-sell", labelFa: "فروش همه دارایی‌های قبلی از روی ترس", labelEn: "Sell all previous holdings out of fear", score: 38, feedbackFa: "فروش وحشت‌زده بدون چک‌لیست می‌تواند همان‌قدر خطرناک باشد که خرید هیجانی.", feedbackEn: "Panic selling without a checklist can be as risky as emotional buying." },
      { id: "pause-plan", labelFa: "۱۰ دقیقه توقف، ثبت احساس، بررسی حد ضرر و تصمیم پله‌ای", labelEn: "Pause, journal emotion, check stop rules and decide gradually", score: 94, feedbackFa: "این رفتار دقیقاً هدف آکادمی است: اول کنترل هیجان، بعد تصمیم با چک‌لیست.", feedbackEn: "This is the academy target: emotional control first, checklist decision second." },
    ],
    mentorFa: "این ریزش را از زاویه ترس، FOMO، حد ضرر و ژورنال تصمیم بررسی کن.",
    mentorEn: "Review this crash through fear, FOMO, stop-loss and decision journaling.",
    lessonFa: "/academy/term-7",
    lessonEn: "/en/academy/term-7",
  },
  {
    id: "portfolio-overexposed-altcoins",
    kind: "portfolio",
    term: 6,
    xp: 170,
    titleFa: "سبد پرریسک آلتکوین؛ تنوع یا توهم تنوع؟",
    titleEn: "Altcoin-heavy portfolio: diversification or illusion?",
    subtitleFa: "کاربر چند دارایی مختلف دارد، اما همه با یک چرخه ریسک حرکت می‌کنند. تمرین برای تشخیص همبستگی، نقدشوندگی و سهم استیبل‌کوین.",
    subtitleEn: "The user holds different assets, but most move with the same risk cycle. This trains correlation, liquidity and stablecoin allocation.",
    marketFa: ["BTC: ۲۰٪", "ETH: ۲۰٪", "میم‌کوین‌ها: ۴۵٪", "Stablecoin: ۱۵٪"],
    marketEn: ["BTC: 20%", "ETH: 20%", "Memecoins: 45%", "Stablecoin: 15%"],
    objectiveFa: "سبد را از نظر تمرکز ریسک، نقدشوندگی و توان تحمل ریزش تحلیل کن.",
    objectiveEn: "Analyze concentration risk, liquidity and drawdown tolerance.",
    choices: [
      { id: "more-memes", labelFa: "افزایش میم‌کوین‌ها چون رشد سریع‌تر دارند", labelEn: "Increase memecoins because they can move faster", score: 29, feedbackFa: "رشد سریع‌تر معمولاً ریسک سقوط سریع‌تر هم دارد. تمرکز ۴۵٪ روی میم‌کوین برای تازه‌کار بسیار پرریسک است.", feedbackEn: "Faster upside often means faster downside. 45% memecoin exposure is high risk for beginners." },
      { id: "rebalance-core", labelFa: "کاهش تمرکز میم‌کوین و افزایش دارایی‌های اصلی و نقد", labelEn: "Reduce memecoin concentration and increase core assets/cash", score: 89, feedbackFa: "تصمیم سالم‌تر؛ سبد باید تحمل ریزش، نقدشوندگی و برنامه خروج داشته باشد.", feedbackEn: "Healthier. A portfolio needs drawdown tolerance, liquidity and exit planning." },
      { id: "hold-no-review", labelFa: "هیچ تغییری نمی‌دهم چون تعداد ارزها زیاد است", labelEn: "Do nothing because there are many coins", score: 42, feedbackFa: "تعداد ارز زیاد الزاماً تنوع واقعی نیست. اگر همه با یک ریسک سقوط کنند، توهم تنوع است.", feedbackEn: "Many coins do not guarantee diversification. If they fall together, it is illusion of diversification." },
    ],
    mentorFa: "این سبد را با تمرکز روی همبستگی، نقدشوندگی، Stablecoin و Drawdown تحلیل کن.",
    mentorEn: "Analyze this portfolio through correlation, liquidity, stablecoin allocation and drawdown.",
    lessonFa: "/academy/term-6",
    lessonEn: "/en/academy/term-6",
  },
  {
    id: "fomo-after-green-candle",
    kind: "psychology",
    term: 7,
    xp: 165,
    titleFa: "جا ماندن از کندل سبز؛ تصمیم یا FOMO؟",
    titleEn: "Missing a green candle: decision or FOMO?",
    subtitleFa: "قیمت ۷٪ رشد کرده و حس می‌کنی اگر همین الان نخری، همه فرصت‌ها از دست می‌رود.",
    subtitleEn: "Price is up 7% and you feel that if you do not buy now, every opportunity will disappear.",
    marketFa: ["رشد روزانه: +۷٪", "حس غالب: عجله", "ریسک اصلی: ورود بعد از حرکت بدون برنامه", "تمرین: تبدیل احساس به چک‌لیست"],
    marketEn: ["Daily move: +7%", "Dominant feeling: urgency", "Main risk: entering after the move without a plan", "Practice: turn emotion into checklist"],
    objectiveFa: "احساس خود را نام‌گذاری کن، دلیل ورود را بنویس و قبل از معامله یک قانون توقف تعیین کن.",
    objectiveEn: "Name the emotion, write the entry reason and define a stop rule before trading.",
    choices: [
      { id: "buy-now", labelFa: "همین الان می‌خرم چون ممکن است بالاتر برود", labelEn: "Buy now because it may go higher", score: 27, feedbackFa: "این جمله نشانه کلاسیک FOMO است. احتمال رشد بیشتر وجود دارد، اما بدون حد ضرر و سناریو تصمیم مسئولانه نیست.", feedbackEn: "This is classic FOMO. It may go higher, but without stop and scenario it is not responsible." },
      { id: "write-plan", labelFa: "اول دلیل، حد ضرر، اندازه موقعیت و نقطه ابطال را می‌نویسم", labelEn: "First write reason, stop-loss, position size and invalidation", score: 92, feedbackFa: "تصمیم بالغ؛ احساس را انکار نمی‌کنی، ولی اجازه نمی‌دهی کنترل تصمیم را بگیرد.", feedbackEn: "Mature decision. You do not deny emotion, but you do not let it drive the trade." },
      { id: "never-buy", labelFa: "دیگر هیچ وقت نمی‌خرم چون جا ماندم", labelEn: "Never buy because I missed it", score: 51, feedbackFa: "این هم واکنش احساسی است. هدف حذف تصمیم نیست؛ تبدیل تصمیم به سیستم است.", feedbackEn: "This is also emotional. The goal is not no decision; it is systematic decision-making." },
    ],
    mentorFa: "این حس را با مفهوم FOMO، ژورنال و قانون توقف تحلیل کن.",
    mentorEn: "Analyze this feeling through FOMO, journaling and stop rules.",
    lessonFa: "/academy/term-7",
    lessonEn: "/en/academy/term-7",
  },
  {
    id: "leverage-liquidation-risk",
    kind: "risk",
    term: 6,
    xp: 185,
    titleFa: "اهرم بالا؛ چرا چند درصد حرکت بازار می‌تواند کل سرمایه را نابود کند؟",
    titleEn: "High leverage: why a small market move can destroy capital",
    subtitleFa: "کاربر تازه‌کار با سرمایه کم می‌خواهد از اهرم بالا استفاده کند. تمرین برای فهم لیکوئید شدن، اندازه موقعیت و قانون توقف.",
    subtitleEn: "A beginner wants to use high leverage with limited capital. This trains liquidation, position sizing and stop rules.",
    marketFa: ["سرمایه فرضی: ۵۰۰ USDT", "اهرم پیشنهادی: ۲۰x", "حرکت خلاف جهت: ۵٪", "ریسک اصلی: لیکوئید شدن"],
    marketEn: ["Sample balance: 500 USDT", "Proposed leverage: 20x", "Move against position: 5%", "Main risk: liquidation"],
    objectiveFa: "قبل از هر اهرم، بدترین سناریو، ریسک هر معامله و جایگزین اسپات را بررسی کن.",
    objectiveEn: "Before leverage, review worst-case scenario, risk per trade and spot alternatives.",
    choices: [
      { id: "leverage-all", labelFa: "استفاده از ۲۰x چون سرمایه کم است", labelEn: "Use 20x because capital is small", score: 18, feedbackFa: "این منطق خطرناک است. سرمایه کم دلیل افزایش اهرم نیست؛ دلیل کوچک‌تر کردن ریسک است.", feedbackEn: "Dangerous logic. Small capital is not a reason to increase leverage; it is a reason to reduce risk." },
      { id: "spot-first", labelFa: "شروع با اسپات یا شبیه‌سازی تا فهم ریسک", labelEn: "Start with spot or simulation until risk is understood", score: 93, feedbackFa: "برای تازه‌کار بهترین انتخاب است. اول مهارت، بعد ابزارهای پرریسک.", feedbackEn: "Best for beginners. Skill first, high-risk tools later." },
      { id: "tiny-risk", labelFa: "اگر اهرم استفاده شود، فقط با ریسک بسیار کوچک و قانون توقف", labelEn: "If leverage is used, only tiny risk and strict stop rules", score: 76, feedbackFa: "بهتر از ورود بی‌برنامه است، اما برای سطح مبتدی هنوز نیاز به احتیاط شدید دارد.", feedbackEn: "Better than unplanned entry, but still requires extreme caution for beginners." },
    ],
    mentorFa: "این سناریوی اهرم را با تمرکز روی لیکوئید شدن، اندازه موقعیت و جایگزین اسپات تحلیل کن.",
    mentorEn: "Analyze this leverage scenario through liquidation, position sizing and spot alternatives.",
    lessonFa: "/academy/term-6",
    lessonEn: "/en/academy/term-6",
  },
];
