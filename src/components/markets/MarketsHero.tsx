import React from "react";


type Props = {
  t: (key: string) => string;
};
export default function MarketsHero({ t }: Props) {
  return (
    <section className="w-full pt-36 pb-6 px-4 md:pt-40">
      <div className="max-w-7xl mx-auto text-center">
        <h1 className="text-[34px] md:text-[44px] font-black text-fg tracking-[-0.04em]">
          مارکت برد آنلاین
        </h1>
        <p className="mt-3 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300">
          قیمت لحظه‌ای رمزارزها از سرویس بازار تک‌پی؛ جست‌وجو، مقایسه و بررسی قبل از معامله
        </p>
      </div>
    </section>
  );
}
