
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { academyArticles } from "@/data/academy";
import { ContentShell, FaqList, SeoNote } from "@/components/content/ContentUI";
import { NeonIcon } from "@/components/tecpey/NeonIcon";
import { ArrowLeft, Clock3, BookOpen, CheckCircle2 } from "lucide-react";
import { TermQuizClient } from "@/components/academy/TermQuizClient";
import { AcademyLessonPlayer } from "@/components/academy/AcademyLessonPlayer";

type Props = { params: Promise<{ slug: string }> };


const termAcademyArticles: typeof academyArticles = [];

const termQuizData: Record<string, { title: string; questions: { q: string; options: string[] }[] }> = {};

function getFaLearningNotes(slug: string, heading: string) {
  const h = heading.toLowerCase();

  if (slug === "term-1" && h.includes("بلاکچین")) {
    return {
      learn: "می‌فهمید چرا بلاکچین مثل یک دفتر حساب مشترک است و چرا تغییر دادن سابقه در آن ساده نیست.",
      example: "مثل دفتر حسابداری یک اداره که چند نفر نسخه یکسانی از آن دارند؛ اگر یک نفر بخواهد عددی را عوض کند، نسخه‌های دیگر اختلاف را نشان می‌دهند.",
      mistake: "اشتباه رایج این است که فکر کنیم بلاکچین همان بیت‌کوین است؛ بیت‌کوین فقط یکی از کاربردهای بلاکچین است.",
    };
  }
  if (slug === "term-1") {
    return {
      learn: "فرق بیت‌کوین، تتر و کیف پول را می‌فهمید و می‌دانید هرکدام چه نقشی در بازار دارند.",
      example: "تتر را می‌توان شبیه یک ابزار دلاری برای جابه‌جایی ارزش دانست، اما هنوز باید شبکه انتقال و کارمزد را دقیق بررسی کرد.",
      mistake: "اشتباه رایج این است که کاربر عبارت بازیابی کیف پول را در گوشی یا پیام‌رسان ذخیره کند و امنیت دارایی را به خطر بیندازد.",
    };
  }
  if (slug === "term-2") {
    return {
      learn: "یاد می‌گیرید امنیت فقط رمز عبور نیست؛ ایمیل، موبایل، 2FA و لینک‌های ورودی هم بخشی از امنیت هستند.",
      example: "مثل قفل خانه است: اگر در اصلی قفل باشد اما پنجره باز باشد، خانه همچنان ناامن است.",
      mistake: "اشتباه رایج اعتماد به پیام‌های فوری مثل «حساب شما بسته می‌شود، سریع وارد شوید» و کلیک روی لینک جعلی است.",
    };
  }
  if (slug === "term-3") {
    return {
      learn: "یاد می‌گیرید قبل از خرید، فروش یا برداشت، بازار، کارمزد، آدرس و شبکه انتقال را بررسی کنید.",
      example: "مثل کارت‌به‌کارت است؛ قبل از تأیید باید شماره کارت، نام مقصد و مبلغ را چک کنید. در رمزارز، شبکه انتقال هم اضافه می‌شود.",
      mistake: "اشتباه رایج انتخاب ارزان‌ترین شبکه بدون بررسی هماهنگی با مقصد است؛ این کار می‌تواند باعث از دست رفتن دارایی شود.",
    };
  }
  if (slug === "term-4") {
    return {
      learn: "نمودار را به‌عنوان زبان رفتار خریدار و فروشنده می‌بینید، نه یک ابزار جادویی برای پیش‌بینی قطعی.",
      example: "اگر قیمت چندبار در یک محدوده واکنش نشان دهد، مثل یک نقطه شلوغ در بازار است که توجه معامله‌گران را جلب کرده.",
      mistake: "اشتباه رایج این است که با دیدن یک اندیکاتور، بدون مدیریت ریسک وارد معامله شویم.",
    };
  }
  if (slug === "term-5") {
    return {
      learn: "یاد می‌گیرید پروژه را از نظر تیم، کاربرد، وایت‌پیپر، توکنومیکس و ریسک‌ها بررسی کنید.",
      example: "مثل بررسی یک شرکت قبل از همکاری است؛ فقط ظاهر سایت کافی نیست، باید تیم، محصول و مدل اقتصادی روشن باشد.",
      mistake: "اشتباه رایج خرید پروژه فقط به‌خاطر تبلیغ زیاد یا رشد قیمت کوتاه‌مدت است.",
    };
  }
  if (slug === "term-6") {
    return {
      learn: "یاد می‌گیرید قبل از فکر کردن به سود، مقدار ریسک و نقطه خروج را مشخص کنید.",
      example: "مثل رانندگی در جاده مه‌آلود است؛ سرعت کمتر و فاصله ایمن، مهم‌تر از زود رسیدن است.",
      mistake: "اشتباه رایج افزایش حجم معامله بعد از ضرر برای جبران سریع است.",
    };
  }
  return {
    learn: "یاد می‌گیرید ورود حرفه‌ای یعنی ترکیب آموزش، امنیت، تحلیل، مدیریت سرمایه و کنترل رفتار.",
    example: "مثل رانندگی حرفه‌ای است؛ فقط گاز دادن کافی نیست، باید ترمز، قوانین، آینه، فاصله ایمن و شرایط جاده را هم بشناسید.",
    mistake: "اشتباه رایج این است که کاربر با چند ابزار تحلیلی احساس حرفه‌ای بودن کند و مدیریت ریسک را کنار بگذارد.",
  };
}


function getTermNumber(slug: string) {
  const match = slug.match(/term-(\d+)/);
  return match ? Number(match[1]) : 1;
}

function TermQuizBox({ slug }: { slug: string }) {
  const quiz = termQuizData[slug];
  if (!quiz) return null;
  const termNumber = getTermNumber(slug);
  return <TermQuizClient title={quiz.title} questions={quiz.questions.map((q) => ({ q: q.q, options: [...q.options] }))} locale="fa" storageKey={`tecpey-academy-term-${termNumber}`} termNumber={termNumber} />;
}

function getArticle(slug: string) {
  return academyArticles.find((article) => article.slug === slug);
}

export async function generateStaticParams() {
  return academyArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "آکادمی تک‌پی" };
  return {
    title: `${article.title} | آکادمی تک‌پی`,
    description: article.description,
    alternates: { canonical: `https://tecpey.ir/academy/${article.slug}` },
  };
}

export default async function AcademyArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    inLanguage: "fa-IR",
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: "TecPey" },
    publisher: {
      "@type": "Organization",
      name: "TecPey",
      logo: { "@type": "ImageObject", url: "https://tecpey.ir/images/tecpey-logo.png" },
    },
    mainEntityOfPage: `https://tecpey.ir/academy/${article.slug}`,
    keywords: [...article.keywords],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Course",
        name: article.title,
        description: article.description,
        provider: { "@type": "Organization", name: "TecPey Academy", sameAs: "https://tecpey.ir/academy" },
        inLanguage: "fa-IR",
        educationalLevel: "Beginner to Advanced",
        teaches: [article.title, article.description],
        hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", location: { "@type": "VirtualLocation", url: `https://tecpey.ir/academy/${article.slug}` } }
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <article className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Link href="/academy" className="inline-flex items-center gap-2 text-sm font-black text-cyan-500">
              <ArrowLeft className="h-4 w-4 rotate-180" />
              بازگشت به آکادمی
            </Link>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.2] text-slate-950 dark:text-white sm:text-5xl">
              {article.title}
            </h1>
            <p className="mt-5 text-lg leading-9 text-slate-600 dark:text-slate-300">{article.description}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-black text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-2 text-cyan-500">
                <Clock3 className="h-4 w-4" />
                {article.readTime}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-2 dark:bg-white/10">آخرین بروزرسانی: {article.updatedAt}</span>
            </div>
            <div className="mt-8 rounded-[30px] border border-cyan-300/20 bg-[#06111f] p-6 shadow-[0_24px_70px_rgba(34,211,238,.12)]">
              <div className="flex items-center gap-4">
                <NeonIcon icon={BookOpen} size="md" />
                <div>
                  <h2 className="text-xl font-black text-white">خلاصه سریع</h2>
                  <p className="mt-2 text-base font-bold leading-9 text-slate-300">{article.summary}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                ["این ترم برای چه کسانی مناسب است؟", "برای کارمند، دانشجو، والدین، کاربر تازه‌کار یا حتی کسی که فقط اسم بیت‌کوین و تتر را شنیده و می‌خواهد بدون ترس مفاهیم را بفهمد."],
                ["چطور بخوانید؟", "اول متن را ساده و آرام بخوانید، بعد مثال‌ها را برای خودتان توضیح دهید، سپس آزمون پایان ترم را بزنید و پاسخ‌های اشتباه را مرور کنید."],
                ["بعد از این ترم چه می‌شود؟", "اگر حداقل ۳ پاسخ از ۴ سؤال را درست بزنید، از نظر آموزشی آماده‌اید وارد ترم بعد شوید؛ اگر نه، همین صفحه را دوباره مرور کنید."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.04]">
                  <h3 className="font-black text-slate-950 dark:text-white">{title}</h3>
                  <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{text}</p>
                </div>
              ))}
            </div>

            <AcademyLessonPlayer slug={article.slug} sections={[...article.sections]} locale="fa" />

            <TermQuizBox slug={article.slug} />

            <section className="mt-12">
              <h2 className="mb-5 text-2xl font-black">سوالات پرتکرار</h2>
              <FaqList faqs={[...article.faqs]} />
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <SeoNote />
            <div className="rounded-[30px] border border-cyan-300/15 bg-white/80 p-5 dark:border-cyan-300/10 dark:bg-white/[0.04]">
              <div className="mb-4"><NeonIcon icon={BookOpen} size="sm" /></div>
              <h3 className="font-black">کلیدواژه‌های این مقاله</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {article.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-full bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-500">{keyword}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </article>
    </ContentShell>
  );
}
