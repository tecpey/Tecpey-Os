
import Link from "next/link";
import { FaInstagram, FaDiscord } from "react-icons/fa6";
import { FaTelegramPlane } from "react-icons/fa";
import { Mail, MapPin, Phone, Smartphone, Clock3 } from "lucide-react";

const contactCards = [
  {
    icon: MapPin,
    title: "دفتر مرکزی تک‌پی",
    text: "مازندران، بابل، چهارراه تندست، جنب کریستال، دفتر تک‌پی",
    href: "https://www.google.com/maps/search/?api=1&query=%D8%A8%D8%A7%D8%A8%D9%84%20%DA%86%D9%87%D8%A7%D8%B1%D8%B1%D8%A7%D9%87%20%D8%AA%D9%86%D8%AF%D8%B3%D8%AA%20%D8%AC%D9%86%D8%A8%20%DA%A9%D8%B1%DB%8C%D8%B3%D8%AA%D8%A7%D9%84",
  },
  { icon: Phone, title: "تلفن ثابت", text: "۰۱۱۳۲۳۳۸۰۲۶", href: "tel:01132338026" },
  { icon: Smartphone, title: "تلفن همراه", text: "۰۹۱۱۱۱۶۶۴۴۰", href: "tel:09111166440" },
  { icon: Mail, title: "ایمیل عمومی", text: "info@tecpey.ir", href: "mailto:info@tecpey.ir" },
  { icon: Mail, title: "ایمیل پشتیبانی", text: "support@tecpey.ir", href: "mailto:support@tecpey.ir" },
  { icon: Clock3, title: "ساعات پاسخگویی", text: "شنبه تا پنجشنبه، ۰۹:۰۰ تا ۱۸:۰۰", href: "#" },
];

export default function Contact() {
  return (
    <main className="min-h-screen bg-bg pt-28 text-fg">
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-400">ارتباط با تک‌پی</p>
          <h1 className="mt-6 text-4xl font-black leading-tight md:text-5xl">ما برای پاسخ‌گویی و همراهی کنار شما هستیم</h1>
          <p className="mt-5 text-base leading-8 text-muted">برای سوالات مربوط به ثبت‌نام، بازارها، همکاری یا پشتیبانی، از راه‌های رسمی زیر با دفتر تک‌پی و تیم تک‌پی در ارتباط باشید.</p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contactCards.map((card) => (
            <Link key={card.title} href={card.href} className="rounded-3xl border border-primary/20 bg-white/5 p-6 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:bg-white/10">
              <card.icon className="h-8 w-8 text-primary" />
              <h2 className="mt-5 text-xl font-black">{card.title}</h2>
              <p className="mt-3 text-sm leading-8 text-muted">{card.text}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.8fr]">
          <div className="rounded-[32px] border border-primary/20 bg-white/5 p-8">
            <h2 className="text-2xl font-black">پیام خود را برای تک‌پی ارسال کنید</h2>
            <p className="mt-3 text-sm leading-8 text-muted">فرم زیر برای دریافت اولیه پیام‌هاست. برای پشتیبانی سریع‌تر، ایمیل info@tecpey.ir یا تلگرام رسمی تک‌پی را هم می‌توانید استفاده کنید.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <input className="rounded-2xl border border-primary/20 bg-bg px-4 py-3 outline-none focus:border-primary" placeholder="نام و نام خانوادگی" />
              <input className="rounded-2xl border border-primary/20 bg-bg px-4 py-3 outline-none focus:border-primary" placeholder="ایمیل یا شماره تماس" />
              <input className="rounded-2xl border border-primary/20 bg-bg px-4 py-3 outline-none focus:border-primary md:col-span-2" placeholder="موضوع پیام" />
              <textarea className="min-h-36 rounded-2xl border border-primary/20 bg-bg px-4 py-3 outline-none focus:border-primary md:col-span-2" placeholder="متن پیام" />
            </div>
            <Link href="mailto:info@tecpey.ir" className="mt-6 inline-flex rounded-2xl bg-primary px-6 py-3 font-black text-white">ارسال پیام به پشتیبانی</Link>
          </div>

          <div className="rounded-[32px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_35%),linear-gradient(145deg,#06111f,#0f172a)] p-8 text-white">
            <h2 className="text-2xl font-black">رسانه‌های رسمی تک‌پی</h2>
            <p className="mt-3 text-sm leading-8 text-white/70">برای دریافت اطلاعیه‌ها، اخبار و آموزش‌های فارسی تک‌پی، فقط کانال‌ها و آدرس‌های رسمی زیر را دنبال کنید.</p>
            <div className="mt-6 space-y-3">
              <a href="https://t.me/tecpeyco" className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 hover:bg-white/15"><FaTelegramPlane /> تلگرام: t.me/tecpeyco</a>
              <a href="https://instagram.com/tecpeyco" className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 hover:bg-white/15"><FaInstagram /> اینستاگرام: @tecpeyco</a>
              <a href="https://discord.gg/tecpeyex" className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 hover:bg-white/15"><FaDiscord /> دیسکورد: tecpeyex</a>
              <a href="mailto:info@tecpey.ir" className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 hover:bg-white/15"><Mail className="h-4 w-4" /> ایمیل رسمی: info@tecpey.ir</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
