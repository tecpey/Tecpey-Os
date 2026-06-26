import type React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { academyPathTerms } from "@/data/academyPath";
import { caseStudiesForTerm } from "@/data/academyCaseStudies";
import { ContentShell } from "@/components/content/ContentUI";
import { TermQuizClient } from "@/components/academy/TermQuizClient";
import { TermAccessGuard } from "@/components/academy/TermAccessGuard";
import { MentorChallengeBox } from "@/components/learning-os/MentorChallengeBox";
import { ArrowLeft, BookOpen, Brain, CheckCircle2, ClipboardCheck, Lightbulb, ListChecks, MessageCircleQuestion, ShieldCheck, Target, TriangleAlert } from "lucide-react";

const termEnhancements: Record<number, { caseStudy: string; practice: string; mentorPrompt: string; mastery: string[] }> = {
  1: {
    caseStudy: "کاربر تازه‌واردی را تصور کنید که فقط چون قیمت یک توکن پایین است آن را می‌خرد. در این سناریو باید قیمت واحد، Market Cap، عرضه، نقدشوندگی و کاربرد واقعی را کنار هم ببیند تا بفهمد ارزان بودن ظاهری با ارزنده بودن فرق دارد.",
    practice: "سه دارایی مختلف را انتخاب کنید و برای هرکدام در یک جدول کوتاه بنویسید: کاربرد، عرضه، ارزش بازار، ریسک اصلی، دلیل نخریدن. هدف تمرین خرید نیست؛ هدف ساختن نگاه مقایسه‌ای است.",
    mentorPrompt: "برای من تفاوت قیمت پایین، Market Cap و نقدشوندگی را با یک مثال عددی ساده توضیح بده.",
    mastery: ["تفاوت کوین، توکن و استیبل‌کوین را توضیح می‌دهم.", "می‌توانم قیمت را از ارزش بازار جدا کنم.", "می‌دانم تتر دلار بانکی نیست و ریسک دارد."],
  },
  2: {
    caseStudy: "یک پیام جعلی با ظاهر پشتیبانی صرافی برای کاربر ارسال می‌شود و از او کد ورود می‌خواهد. کاربر حرفه‌ای باید پیام فوری، لینک مشکوک، درخواست اطلاعات محرمانه و فشار روانی را به‌عنوان نشانه خطر تشخیص دهد.",
    practice: "چک‌لیست امنیت شخصی بسازید: ایمیل امن، رمز یکتا، 2FA، بوکمارک دامنه رسمی، خروج از دستگاه‌های ناشناس، نگهداری آفلاین Seed Phrase.",
    mentorPrompt: "اگر کسی از من Seed Phrase یا کد 2FA خواست، قدم به قدم چه کار کنم؟",
    mastery: ["می‌دانم Seed Phrase را نباید آنلاین ذخیره کنم.", "فیشینگ را با نشانه‌های رفتاری تشخیص می‌دهم.", "قبل از انتقال، شبکه و آدرس را چک می‌کنم."],
  },
  3: {
    caseStudy: "کاربر می‌خواهد سریع وارد بازار شود و از Market Order استفاده می‌کند، اما به عمق بازار و اسلیپیج توجه نمی‌کند. نتیجه این است که قیمت نهایی با عددی که دیده متفاوت می‌شود.",
    practice: "برای یک خرید فرضی بنویسید: نوع سفارش، قیمت مطلوب، کارمزد، حداقل مقدار قابل قبول، شبکه برداشت و دلیل انتخاب آن سفارش.",
    mentorPrompt: "Market Order و Limit Order را با مثال خرید تتر یا بیت‌کوین مقایسه کن.",
    mastery: ["نوع سفارش را با هدف خودم انتخاب می‌کنم.", "کارمزد، اسپرد و اسلیپیج را قبل از تأیید می‌بینم.", "برداشت را بدون بررسی شبکه انجام نمی‌دهم."],
  },
  4: {
    caseStudy: "یک پروژه با تبلیغات زیاد و قیمت واحد پایین معرفی می‌شود، اما FDV آن بسیار بالاست و بخش بزرگی از توکن‌ها هنوز آزاد نشده‌اند. تحلیل حرفه‌ای یعنی دیدن ریسک آزادسازی و فشار فروش احتمالی.",
    practice: "برای یک پروژه فرضی پرونده بسازید: تیم، کاربرد، وایت‌پیپر، توکنومیکس، FDV، Vesting، نقدشوندگی، سه Red Flag و سه دلیل مخالف خرید.",
    mentorPrompt: "چطور بفهمم یک پروژه از نظر توکنومیکس خطرناک است؟",
    mastery: ["FDV و Market Cap را جدا می‌فهمم.", "Vesting و Unlock را در ریسک لحاظ می‌کنم.", "فقط با تبلیغ یا پامپ وارد پروژه نمی‌شوم."],
  },
  5: {
    caseStudy: "قیمت مقاومت را می‌شکند و RSI بالاست؛ افراد زیادی عجله می‌کنند. اما کندل بعدی زیر مقاومت بسته می‌شود و شکست جعلی رخ می‌دهد. این سناریو اهمیت صبر، حجم و نقطه ابطال را نشان می‌دهد.",
    practice: "یک نمودار انتخاب کنید و فقط سه چیز علامت بزنید: روند اصلی، دو ناحیه مهم، نقطه‌ای که تحلیل شما باطل می‌شود. از شلوغ کردن نمودار خودداری کنید.",
    mentorPrompt: "اگر RSI بالا باشد ولی روند هم صعودی باشد، چطور تصمیم آموزشی و غیرهیجانی بگیرم؟",
    mastery: ["تحلیل تکنیکال را احتمال می‌دانم نه قطعیت.", "روند، سطح، حجم و ریسک را با هم می‌بینم.", "بدون نقطه ابطال وارد تحلیل نمی‌شوم."],
  },
  6: {
    caseStudy: "سرمایه‌گذار با ۱۰۰ میلیون تومان در یک معامله ۳۰٪ سرمایه را درگیر می‌کند و بعد از افت بازار، برای جبران حجم را بیشتر می‌کند. این دقیقاً مسیری است که Drawdown را عمیق‌تر می‌کند.",
    practice: "برای سرمایه فرضی خود سه عدد بنویسید: حداکثر ریسک هر تصمیم، حد توقف روزانه/هفتگی، و مقدار سرمایه‌ای که اصلاً نباید وارد بازار پرنوسان شود.",
    mentorPrompt: "با سرمایه فرضی، چطور اندازه موقعیت و حد ضرر را بدون توصیه خرید حساب کنم؟",
    mastery: ["قبل از سود به بقا فکر می‌کنم.", "Position Size را با حد ضرر هماهنگ می‌کنم.", "بعد از چند ضرر قانون توقف دارم."],
  },
  7: {
    caseStudy: "کاربر بعد از دیدن رشد شدید یک میم‌کوین دچار FOMO می‌شود و بدون برنامه وارد می‌شود. چند ساعت بعد قیمت برمی‌گردد و برای جبران، معامله انتقامی انجام می‌دهد. این چرخه باید قبل از وقوع شناخته شود.",
    practice: "یک ژورنال تصمیم بسازید: احساس قبل از ورود، دلیل منطقی، سناریوی اشتباه بودن، نقطه توقف، نتیجه و درس آموخته‌شده.",
    mentorPrompt: "وقتی FOMO دارم، چه چک‌لیستی کمک می‌کند وارد تصمیم عجولانه نشوم؟",
    mastery: ["احساساتم را بخشی از ریسک می‌دانم.", "بعد از ضرر معامله انتقامی نمی‌کنم.", "قبل از ورود، چک‌لیست آمادگی را کامل می‌کنم."],
  },
};



function publicQuizQuestions(questions: { q: string; options: string[]; answer?: string }[]) {
  return questions.map(({ q, options }) => ({ q, options }));
}

export function getAcademyTerm(slug: string) {
  return academyPathTerms.find((term) => term.slug === slug);
}

export function generateTermMetadata(slug: string) {
  const term = getAcademyTerm(slug);
  if (!term) return { title: "آکادمی تک‌پی" };
  return {
    title: `${term.title} | آکادمی تک‌پی`,
    description: term.subtitle,
    alternates: { canonical: `https://tecpey.ir/academy/${term.slug}` },
    openGraph: {
      title: `${term.title} | TecPey Academy`,
      description: term.subtitle,
      url: `https://tecpey.ir/academy/${term.slug}`,
      siteName: "TecPey",
      locale: "fa_IR",
      type: "article",
    },
  };
}

export function AcademyTermPage({ slug }: { slug: string }) {
  const term = getAcademyTerm(slug);
  if (!term) return notFound();
  const enhancement = termEnhancements[term.number];
  const caseStudies = caseStudiesForTerm(term.number);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: term.title,
    description: term.subtitle,
    inLanguage: "fa-IR",
    provider: { "@type": "Organization", name: "TecPey", url: "https://tecpey.ir" },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: term.duration,
    },
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <main className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/academy" className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-300 transition hover:bg-cyan-300/15">
            <ArrowLeft className="h-4 w-4 rotate-180" />
            بازگشت به مسیر آکادمی
          </Link>

          <TermAccessGuard termNumber={term.number} locale="fa">
          <section className="mt-8 overflow-hidden rounded-[36px] border border-cyan-300/15 bg-[#06111f]/95 shadow-[0_30px_100px_rgba(0,0,0,.35)]">
            <div className="grid gap-8 p-6 lg:grid-cols-[1fr_360px] lg:p-10">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">ترم {term.number}</span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-200">{term.level}</span>
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100">{term.duration}</span>
                </div>
                <h1 className="mt-6 text-balance text-4xl font-black leading-[1.2] text-white sm:text-5xl">{term.title}</h1>
                <p className="mt-5 max-w-3xl text-lg font-bold leading-9 text-slate-300">{term.subtitle}</p>
                <div className="mt-7 rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5">
                  <div className="flex items-center gap-3 text-cyan-200">
                    <Target className="h-6 w-6" />
                    <h2 className="text-lg font-black">هدف آموزشی این ترم</h2>
                  </div>
                  <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{term.outcome}</p>
                </div>
              </div>

              <aside className="rounded-[30px] border border-cyan-300/15 bg-cyan-300/10 p-5">
                <h2 className="text-xl font-black text-white">نقشه سریع ترم</h2>
                <div className="mt-4 grid gap-3">
                  {term.lessons.map((lesson, index) => (
                    <a key={lesson[0]} href={`#lesson-${index + 1}`} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-sm font-black text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
                      <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200">{index + 1}</span>
                      <span className="leading-7">{lesson[0]}</span>
                    </a>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              {term.lessons.map((lesson, index) => {
                const [title, concept, example, mistake, checklist, proTip] = lesson;
                return (
                  <article id={`lesson-${index + 1}`} key={title} className="scroll-mt-28 rounded-[34px] border border-cyan-200 bg-white/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,.10)] dark:border-cyan-300/15 dark:bg-white/[0.055]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-600 dark:text-cyan-200">درس {index + 1}</span>
                        <h2 className="mt-4 text-2xl font-black leading-10 text-slate-950 dark:text-white">{title}</h2>
                      </div>
                      <BookOpen className="h-8 w-8 text-cyan-400" />
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <InfoCard icon={<Brain className="h-5 w-5" />} title="مفهوم اصلی" text={concept} />
                      <InfoCard icon={<Lightbulb className="h-5 w-5" />} title="مثال واقعی" text={example} />
                      <InfoCard icon={<TriangleAlert className="h-5 w-5" />} title="اشتباه رایج" text={mistake} danger />
                      <InfoCard icon={<ListChecks className="h-5 w-5" />} title="چک‌لیست عملی" text={checklist} />
                    </div>

                    <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5">
                      <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-200">
                        <ShieldCheck className="h-5 w-5" />
                        <h3 className="font-black">نکته حرفه‌ای تک‌پی</h3>
                      </div>
                      <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{proTip}</p>
                      <Link href={`/academy/ai-guide?term=${term.number}&lesson=${index + 1}`} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-700 transition hover:bg-cyan-500/15 dark:text-cyan-100">
                        <MessageCircleQuestion className="h-4 w-4" />
                        درباره این درس از مربی هوشمند بپرس
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-[30px] border border-cyan-300/15 bg-[#06111f] p-5 shadow-[0_20px_70px_rgba(0,0,0,.25)]">
                <h2 className="flex items-center gap-2 text-xl font-black text-white"><ClipboardCheck className="h-5 w-5 text-cyan-300" /> چک‌لیست آمادگی</h2>
                <ul className="mt-4 space-y-3">
                  {term.readiness.map((item) => (
                    <li key={item} className="flex gap-2 text-sm font-bold leading-7 text-slate-300">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link href={`/academy/ai-guide?term=${term.number}`} className="block rounded-[30px] border border-violet-300/20 bg-violet-300/10 p-5 transition hover:-translate-y-1 hover:bg-violet-300/15">
                <h2 className="flex items-center gap-2 text-lg font-black text-violet-100"><MessageCircleQuestion className="h-5 w-5" /> مربی هوشمند این ترم</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">اگر مفهوم، مثال، آزمون یا ریسک این ترم برای شما مبهم است، سؤال آموزشی خود را از AI Mentor تک‌پی بپرسید.</p>
              </Link>

              <div className="rounded-[30px] border border-amber-300/20 bg-amber-300/10 p-5">
                <h2 className="text-lg font-black text-amber-100">یادآوری مهم</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">این مسیر آموزشی توصیه خرید یا فروش نیست. هدف، ساختن دانش کاربردی، رفتار امن‌تر و تصمیم مسئولانه قبل از ورود به بازار رمزارز است.</p>
              </div>
            </aside>
          </section>

          {enhancement ? (
            <section className="mt-10 grid gap-6 lg:grid-cols-3">
              <div className="rounded-[34px] border border-violet-300/20 bg-violet-400/10 p-6">
                <h2 className="text-xl font-black text-white">Case Study واقعی ترم</h2>
                <p className="mt-4 text-sm font-bold leading-8 text-slate-300">{enhancement.caseStudy}</p>
              </div>
              <div className="rounded-[34px] border border-emerald-300/20 bg-emerald-400/10 p-6">
                <h2 className="text-xl font-black text-white">تمرین عملی قبل از ادامه</h2>
                <p className="mt-4 text-sm font-bold leading-8 text-slate-300">{enhancement.practice}</p>
              </div>
              <div className="rounded-[34px] border border-amber-300/20 bg-amber-400/10 p-6">
                <h2 className="text-xl font-black text-white">سؤال پیشنهادی از AI Mentor</h2>
                <p className="mt-4 text-sm font-bold leading-8 text-slate-300">{enhancement.mentorPrompt}</p>
                <Link href={`/academy/ai-guide?term=${term.number}`} className="mt-5 inline-flex rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950">پرسیدن از مربی هوشمند</Link>
              </div>
              <div className="rounded-[34px] border border-cyan-300/20 bg-[#06111f] p-6 lg:col-span-3">
                <h2 className="text-2xl font-black text-white">معیار تسلط در پایان این ترم</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {enhancement.mastery.map((item) => (
                    <div key={item} className="flex gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.055] p-4 text-sm font-bold leading-7 text-slate-200">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}


          {caseStudies.length ? (
            <section className="mt-10 rounded-[34px] border border-violet-300/20 bg-violet-500/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white">تمرین عملی این ترم</h2>
                  <p className="mt-3 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                    در این بخش، مفهوم‌های ترم را در موقعیت‌های واقعی تمرین می‌کنید؛ خطاهای رایج را می‌بینید و قبل از تصمیم مالی، چک‌لیست رفتاری روشن‌تری می‌سازید.
                  </p>
                </div>
                <Link href={`/academy/ai-guide?term=${term.number}`} className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400">پرسش از مربی هوشمند</Link>
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                {caseStudies.map((study) => (
                  <article key={study.slug} className="rounded-[28px] border border-white/10 bg-white/[0.07] p-5">
                    <h3 className="text-xl font-black leading-9 text-white">{study.title}</h3>
                    <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{study.scenario}</p>
                    <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                      <p className="text-sm font-black text-cyan-100">تمرین عملی</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{study.learnerTask}</p>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
                        <p className="text-sm font-black text-rose-100">خطاهای رایج</p>
                        <ul className="mt-2 space-y-2">{study.mistakes.map((item) => <li key={item} className="text-xs font-bold leading-6 text-slate-300">• {item}</li>)}</ul>
                      </div>
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                        <p className="text-sm font-black text-emerald-100">معیار عبور</p>
                        <ul className="mt-2 space-y-2">{study.checkpoints.map((item) => <li key={item} className="text-xs font-bold leading-6 text-slate-300">• {item}</li>)}</ul>
                      </div>
                    </div>
                    <Link href={`/academy/ai-guide?term=${term.number}`} className="mt-4 inline-flex rounded-2xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-xs font-black text-violet-100 transition hover:bg-violet-400/20">{study.mentorQuestion}</Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <h2 className="text-2xl font-black text-white">آزمون پایان ترم</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-300">بعد از مطالعه درس‌ها، آزمون کوتاه را بزنید. هدف آزمون حفظ کردن نیست؛ سنجش این است که آیا مفهوم به رفتار قابل اجرا تبدیل شده یا نه.</p>
            <MentorChallengeBox locale="fa" termNumber={term.number} lessonSlug={term.slug} topic={term.number >= 6 ? "risk-management" : term.number >= 5 ? "technical-analysis" : "risk-awareness"} />
            <TermQuizClient title={`آزمون ${term.title}`} questions={publicQuizQuestions(term.questions)} locale="fa" storageKey={`tecpey-academy-term-${term.number}`} termNumber={term.number} />
          </section>
          </TermAccessGuard>
        </div>
      </main>
    </ContentShell>
  );
}

function InfoCard({ icon, title, text, danger = false }: { icon: React.ReactNode; title: string; text: string; danger?: boolean }) {
  return (
    <div className={`rounded-3xl border p-5 ${danger ? "border-rose-300/20 bg-rose-50 dark:bg-rose-400/10" : "border-cyan-200 bg-cyan-50/70 dark:border-cyan-300/15 dark:bg-cyan-300/10"}`}>
      <div className={`flex items-center gap-3 ${danger ? "text-rose-700 dark:text-rose-200" : "text-cyan-700 dark:text-cyan-200"}`}>
        {icon}
        <h3 className="font-black">{title}</h3>
      </div>
      <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{text}</p>
    </div>
  );
}
