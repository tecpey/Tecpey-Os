"use client";
import { forwardRef, useState } from "react";
import { getCoinKnowledge } from "@/data/coinKnowledge";

type Props = {
  symbol: string;
  coin?: any;
};

function metric(value: unknown, suffix = "") {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "در حال دریافت از مارکت‌برد آنلاین";
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(n)}${suffix}`;
}

const AboutCoin = forwardRef<HTMLDivElement, Props>(({ symbol, coin }, ref) => {
  const [expanded, setExpanded] = useState(false);
  const profile = getCoinKnowledge(symbol, coin?.name, coin?.faName);

  const marketCap = coin?.priceData?.marketCap ?? coin?.marketCap ?? coin?.priceData?.market_cap;
  const volume = coin?.priceData?.quoteVolume ?? coin?.priceData?.volume ?? coin?.volume;
  const circulating = coin?.circulatingSupply ?? coin?.priceData?.circulatingSupply;
  const totalSupply = coin?.totalSupply ?? coin?.priceData?.totalSupply;
  const maxSupply = coin?.maxSupply ?? coin?.priceData?.maxSupply;
  const fdv = coin?.fdv ?? coin?.priceData?.fdv ?? coin?.fullyDilutedValuation ?? coin?.priceData?.fullyDilutedValuation;

  return (
    <div ref={ref} className="ac-card rounded-2xl p-4 sm:p-6 shadow-lg flex flex-col">
      <h2 className="ac-title text-lg sm:text-xl font-bold mb-3 sm:mb-4">
        معرفی کامل {profile.faName} ({profile.symbol})
      </h2>

      <div className={`ac-body text-xs sm:text-sm leading-6 sm:leading-relaxed space-y-5 overflow-hidden transition-all duration-500 ease-in-out ${expanded ? "max-h-[2600px]" : "max-h-[1600px]"}`}>
        <div className="rounded-2xl border border-primary/20 bg-white/5 p-4">
          <p className="font-bold text-fg/90">{profile.coreIdea}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["نام پروژه / شرکت", profile.projectEntity],
            ["سال شروع", profile.launch],
            ["دسته‌بندی", profile.category],
            ["مدل اجماع", profile.consensus],
            ["ارزش بازار", metric(marketCap, " USDT")],
            ["حجم معاملات ۲۴ساعته", metric(volume, " USDT")],
            ["ارزش کاملاً رقیق‌شده FDV", metric(fdv, " USDT")],
            ["عرضه در گردش", metric(circulating)],
            ["عرضه کل", metric(totalSupply)],
            ["حداکثر عرضه", metric(maxSupply)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-primary/15 bg-black/10 p-3">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-1 font-bold text-fg/90">{value}</p>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-2 font-black">این رمزارز دقیقاً چیست؟</h3>
          {profile.deepIntro.map((p) => <p key={p}>{p}</p>)}
        </section>

        <section>
          <h3 className="mb-2 font-black">وایت‌پیپر، وب‌سایت و منابع رسمی</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["وب‌سایت رسمی", profile.website],
              ["وایت‌پیپر / مستند اصلی", profile.whitepaper],
              ["مستندات فنی", profile.docs],
            ].map(([label, href]) => (
              <a key={label} href={href || "#"} target="_blank" rel="noreferrer" className={`rounded-xl border border-primary/15 bg-white/5 p-3 font-bold ${href ? "text-primary" : "pointer-events-none text-muted"}`}>
                {label}
              </a>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-black">تحلیل حرفه‌ای ارزش‌گذاری و ریسک</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Price", "قیمت واحد فقط یک عدد است؛ بدون Market Cap، Volume و Supply می‌تواند گمراه‌کننده باشد."],
              ["Market Cap", "اندازه فعلی پروژه و معیار مقایسه با رقبا. پروژه بزرگ‌تر الزاماً فرصت بهتر نیست."],
              ["FDV", "اگر FDV خیلی بزرگ‌تر از Market Cap باشد، ریسک آزادسازی آینده و فشار فروش بیشتر است."],
              ["Volume 24h", "حجم معاملات نشان می‌دهد ورود و خروج چقدر آسان است و آیا قیمت می‌تواند دستکاری شود یا نه."],
              ["Circulating Supply", "تعداد واحدهای در گردش که مستقیماً در محاسبه Market Cap اثر دارد."],
              ["Total / Max Supply", "برای فهم کمیابی، تورم عرضه، برنامه انتشار و ریسک رقیق‌شدن ضروری است."],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-primary/15 bg-white/5 p-3">
                <p className="text-[11px] font-black text-primary">{label}</p>
                <p className="mt-1 text-xs font-bold leading-6 text-fg/80">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-black">چک‌لیست تحلیل قبل از تصمیم</h3>
          <ul className="list-disc space-y-1 pr-5">
            {[
              "آیا کاربرد واقعی پروژه را می‌فهمید یا فقط به‌خاطر رشد قیمت جذب شده‌اید؟",
              "آیا FDV، Market Cap و برنامه آزادسازی توکن با هم منطقی هستند؟",
              "آیا حجم معاملات برای ورود و خروج شما کافی است؟",
              "آیا منابع رسمی، وایت‌پیپر، مستندات و شبکه انتقال را بررسی کرده‌اید؟",
              "آیا سناریوی ضرر و نقطه خروج را قبل از خرید نوشته‌اید؟",
            ].map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-black">چطور عددهای بازار این رمزارز را بخوانیم؟</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Market Cap", "برای مقایسه اندازه پروژه با رقبا؛ عدد بزرگ‌تر الزاماً به معنی فرصت بهتر نیست."],
              ["FDV", "اگر FDV خیلی بزرگ‌تر از Market Cap باشد، آزادسازی توکن‌های آینده و فشار فروش باید جدی بررسی شود."],
              ["Volume 24h", "حجم پایین یعنی خرید و فروش سخت‌تر، اسپرد بیشتر و احتمال لغزش قیمت."],
              ["Supply", "عرضه در گردش، عرضه کل و حداکثر عرضه روی کمیابی، تورم و ارزش‌گذاری اثر مستقیم دارند."],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-primary/15 bg-white/5 p-3">
                <p className="text-[11px] font-black text-primary">{label}</p>
                <p className="mt-1 text-xs font-bold leading-6 text-fg/80">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-black">توکنومیکس و عرضه</h3>
          <p>{profile.supplyModel}</p>
          <p className="mt-2 rounded-xl border border-cyan-300/15 bg-cyan-500/10 p-3 text-xs font-bold leading-6">
            اعداد Market Cap، FDV، Volume، Circulating Supply، Total Supply و Max Supply از مارکت‌برد آنلاین تک‌پی خوانده می‌شوند و در صورت نبود داده معتبر، عدد غیرقابل اتکا نمایش داده نمی‌شود.
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-5">
            {profile.tokenomics.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-black">کاربردهای اصلی</h3>
          <ul className="list-disc space-y-1 pr-5">
            {profile.useCases.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-black">ریسک‌ها و نکات احتیاطی</h3>
          <ul className="list-disc space-y-1 pr-5">
            {profile.risks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-black">چک‌لیست قبل از خرید یا انتقال</h3>
          <ul className="list-disc space-y-1 pr-5">
            {profile.checklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>

      <button onClick={() => setExpanded(!expanded)} className="oc-view-more mt-5 sm:mt-6 inline-block text-xs sm:text-sm font-medium text-start">
        {expanded ? "نمایش کمتر" : "نمایش کامل‌تر"} →
      </button>
    </div>
  );
});

AboutCoin.displayName = "AboutCoin";
export default AboutCoin;
