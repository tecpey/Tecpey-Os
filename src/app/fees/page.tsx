import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BadgePercent,
  Banknote,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Info,
  Network,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "کارمزدها و کمیسیون تک‌پی | شفاف، قابل فهم و بدون هزینه پنهان",
  description:
    "صفحه رسمی کارمزدها در تک‌پی؛ توضیح کارمزد معاملات، واریز و برداشت ریالی، واریز و برداشت رمزارزی، کارمزد شبکه و نکات مهم قبل از ثبت سفارش.",
  alternates: { canonical: "https://tecpey.ir/fees" },
  keywords: [
    "کارمزد تک پی",
    "کمیسیون تک پی",
    "کارمزد صرافی ارز دیجیتال",
    "کارمزد خرید تتر",
    "کارمزد برداشت رمزارز",
    "کارمزد معامله اسپات",
  ],
};

const tradeTiers = [
  {
    level: "شروع",
    condition: "مناسب کاربران تازه‌وارد",
    maker: "تا ۰.۲۰٪",
    taker: "تا ۰.۲۵٪",
    note: "برای شروع معامله با نمایش شفاف هزینه قبل از ثبت سفارش",
  },
  {
    level: "فعال",
    condition: "برای کاربران با فعالیت منظم",
    maker: "تا ۰.۱۸٪",
    taker: "تا ۰.۲۲٪",
    note: "با افزایش فعالیت معاملاتی، امکان کاهش سطح کارمزد فراهم می‌شود",
  },
  {
    level: "حرفه‌ای",
    condition: "برای معامله‌گران پرتراکنش",
    maker: "تا ۰.۱۵٪",
    taker: "تا ۰.۲۰٪",
    note: "مناسب کاربرانی که حجم معاملات بالاتری دارند",
  },
  {
    level: "سازمانی",
    condition: "برای کسب‌وکارها و همکاری‌های ویژه",
    maker: "توافقی",
    taker: "توافقی",
    note: "پس از بررسی نوع همکاری، حجم و نیاز عملیاتی تعیین می‌شود",
  },
];

const feeCards = [
  {
    icon: BadgePercent,
    title: "کارمزد معامله",
    value: "شفاف قبل از سفارش",
    desc: "کارمزد خرید و فروش در صفحه ثبت سفارش نمایش داده می‌شود تا کاربر قبل از تایید، هزینه نهایی را بداند.",
  },
  {
    icon: CreditCard,
    title: "واریز ریالی",
    value: "بدون کارمزد از سمت تک‌پی",
    desc: "در صورت اعمال هزینه توسط درگاه، بانک یا شبکه پرداخت، مبلغ نهایی در همان مسیر پرداخت مشخص می‌شود.",
  },
  {
    icon: Banknote,
    title: "برداشت ریالی",
    value: "طبق ضوابط شبکه بانکی",
    desc: "زمان و هزینه احتمالی تسویه به سرویس بانکی، سیکل پایا/ساتنا و محدودیت‌های بانکی وابسته است.",
  },
  {
    icon: Network,
    title: "برداشت رمزارز",
    value: "وابسته به شبکه",
    desc: "کارمزد برداشت رمزارز ثابت نیست و بر اساس شبکه انتخابی و شرایط لحظه‌ای بلاکچین قبل از تایید نمایش داده می‌شود.",
  },
];

const policyRows = [
  {
    icon: WalletCards,
    title: "واریز رمزارز",
    desc: "تک‌پی برای واریز رمزارز کارمزد جداگانه دریافت نمی‌کند؛ اما هزینه انتقال از مبدا و شبکه بلاکچین بر عهده ارسال‌کننده است.",
  },
  {
    icon: Network,
    title: "انتخاب شبکه",
    desc: "در انتقال دارایی‌هایی مثل تتر، انتخاب شبکه صحیح بسیار مهم است. شبکه مقصد و مبدا باید یکسان باشند.",
  },
  {
    icon: ShieldCheck,
    title: "هزینه پنهان نداریم",
    desc: "هر هزینه‌ای که به سفارش یا برداشت مربوط باشد باید قبل از تایید نهایی به کاربر نمایش داده شود.",
  },
  {
    icon: Zap,
    title: "به‌روزرسانی پویا",
    desc: "کارمزد شبکه‌های بلاکچینی ممکن است با شلوغی شبکه تغییر کند؛ عدد نهایی در لحظه برداشت نمایش داده می‌شود.",
  },
];

const faqs = [
  {
    q: "کارمزد خرید و فروش در تک‌پی چقدر است؟",
    a: "کارمزد معامله بر اساس سطح کاربری، نوع سفارش و شرایط بازار محاسبه می‌شود و قبل از تایید نهایی سفارش به کاربر نمایش داده خواهد شد.",
  },
  {
    q: "آیا واریز ریالی کارمزد دارد؟",
    a: "تک‌پی برای واریز ریالی کارمزد جداگانه دریافت نمی‌کند؛ اما اگر درگاه یا بانک هزینه‌ای اعمال کند، در مسیر پرداخت نمایش داده می‌شود.",
  },
  {
    q: "کارمزد برداشت رمزارز ثابت است؟",
    a: "خیر. کارمزد برداشت رمزارز به شبکه انتخابی و وضعیت لحظه‌ای شبکه بلاکچین وابسته است و قبل از تایید برداشت نمایش داده می‌شود.",
  },
  {
    q: "چرا کارمزد برداشت تتر در شبکه‌های مختلف فرق دارد؟",
    a: "چون هر شبکه بلاکچینی ساختار هزینه و شلوغی متفاوتی دارد. انتخاب شبکه باید با آدرس مقصد هماهنگ باشد.",
  },
  {
    q: "آیا تک‌پی هزینه پنهان دارد؟",
    a: "خیر. هدف تک‌پی شفافیت است؛ پیش از ثبت سفارش یا برداشت، هزینه‌های مرتبط به‌صورت روشن نمایش داده می‌شود.",
  },
];

const feeSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function FeesPage() {
  return (
    <main className="min-h-screen bg-bg pt-28 text-fg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(feeSchema) }} />

      <section className="relative overflow-hidden px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pb-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.22),transparent_34%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.13),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
                <Sparkles className="h-4 w-4" />
                شفافیت مالی در تک‌پی
              </div>
              <h1 className="mt-6 text-balance text-4xl font-black leading-[1.2] text-fg sm:text-5xl lg:text-6xl">
                کارمزدها و کمیسیون تک‌پی؛ ساده، شفاف و قابل بررسی قبل از معامله
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-9 text-muted sm:text-lg">
                تک‌پی تلاش می‌کند هزینه‌های معامله، واریز، برداشت و انتقال رمزارز را به زبان ساده و قبل از تایید نهایی به کاربر نمایش دهد. هیچ عددی نباید برای کاربر غافلگیرکننده باشد.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/markets" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5">
                  مشاهده بازارها
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <Link href="/support" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-black text-fg transition hover:bg-white/10">
                  سوال درباره کارمزد
                  <HelpCircle className="h-5 w-5 text-cyan-500" />
                </Link>
              </div>
            </div>

            <div className="rounded-[34px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_35%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-cyan-200">نمای کلی هزینه‌ها</p>
                  <h2 className="mt-2 text-2xl font-black">قبل از تایید، هزینه را ببینید</h2>
                </div>
                <BadgePercent className="h-12 w-12 text-cyan-300" />
              </div>
              <div className="mt-6 grid gap-3">
                {["کارمزد معامله", "کارمزد شبکه", "واریز و برداشت", "سطح کاربری"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl bg-white/[0.06] p-4">
                    <span className="text-sm text-white/75">{item}</span>
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-xs leading-7 text-cyan-50">
                آخرین عدد قابل اتکا همیشه همان عددی است که قبل از ثبت سفارش یا برداشت در پنل معاملاتی تک‌پی نمایش داده می‌شود.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
          {feeCards.map((card) => (
            <div key={card.title} className="rounded-[30px] border border-white/10 bg-card p-6 shadow-sm">
              <card.icon className="h-8 w-8 text-cyan-500" />
              <h3 className="mt-4 text-lg font-black">{card.title}</h3>
              <p className="mt-2 text-sm font-black text-cyan-500">{card.value}</p>
              <p className="mt-3 text-sm leading-8 text-muted">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-black">سطوح کارمزد معاملات اسپات</h2>
              <p className="mt-3 max-w-3xl text-sm leading-8 text-muted">
                جدول زیر ساختار عمومی کارمزد را نشان می‌دهد. مقادیر نهایی می‌تواند بر اساس سطح کاربری، حجم فعالیت، نوع سفارش و تنظیمات پنل تغییر کند و قبل از تایید سفارش نمایش داده می‌شود.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs font-black text-amber-500">
              <Info className="h-4 w-4" />
              بدون وعده کارمزد ثابت دائمی
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-white/10 bg-card shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-white/5 text-xs text-muted">
                  <tr>
                    <th className="px-5 py-4">سطح</th>
                    <th className="px-5 py-4">شرط عمومی</th>
                    <th className="px-5 py-4">Maker</th>
                    <th className="px-5 py-4">Taker</th>
                    <th className="px-5 py-4">توضیح</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeTiers.map((tier) => (
                    <tr key={tier.level} className="border-t border-white/10">
                      <td className="px-5 py-5 font-black text-fg">{tier.level}</td>
                      <td className="px-5 py-5 text-muted">{tier.condition}</td>
                      <td className="px-5 py-5 font-black text-emerald-500">{tier.maker}</td>
                      <td className="px-5 py-5 font-black text-cyan-500">{tier.taker}</td>
                      <td className="px-5 py-5 text-muted">{tier.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-xs leading-7 text-muted">
            Maker یعنی سفارشی که به دفتر سفارش نقدشوندگی اضافه می‌کند. Taker یعنی سفارشی که از سفارش‌های موجود بازار استفاده می‌کند. این تعریف برای کاربران تازه‌وارد ساده‌سازی شده و ممکن است در پنل معاملاتی با جزئیات بیشتری نمایش داده شود.
          </p>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black">قواعد مهم واریز و برداشت</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {policyRows.map((row) => (
              <div key={row.title} className="rounded-[30px] border border-white/10 bg-card p-6">
                <row.icon className="h-8 w-8 text-cyan-500" />
                <h3 className="mt-4 text-xl font-black">{row.title}</h3>
                <p className="mt-3 text-sm leading-8 text-muted">{row.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-10 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-3xl font-black">سوالات پرتکرار کارمزدها</h2>
          <div className="space-y-3">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-[28px] border border-white/10 bg-card p-5">
                <h3 className="flex items-start gap-2 text-base font-black">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
                  {item.q}
                </h3>
                <p className="mt-3 text-sm leading-8 text-muted">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
