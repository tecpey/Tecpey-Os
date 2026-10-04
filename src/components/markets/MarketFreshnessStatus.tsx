"use client";

import { Clock3, RefreshCw } from "lucide-react";
import { selectFreshPublicMarketRows } from "@/lib/public-market-data";
import type { MarketCurrency } from "@/types/market";
import styles from "./MarketFreshnessStatus.module.css";

export default function MarketFreshnessStatus({ rows, now, locale, isFetching, isError, onRefresh }: {
  rows: MarketCurrency[];
  now: number;
  locale: "fa" | "en";
  isFetching: boolean;
  isError: boolean;
  onRefresh: () => void;
}) {
  const isFa = locale === "fa";
  const unavailable = rows.length - selectFreshPublicMarketRows(rows, now).length;
  const degraded = now > 0 && (unavailable > 0 || rows.length === 0 || isError);
  const count = new Intl.NumberFormat(isFa ? "fa-IR" : "en-US").format(unavailable);
  const title = now === 0
    ? (isFa ? "در حال بررسی زمان قیمت‌ها" : "Checking price timestamps")
    : unavailable > 0
      ? (isFa ? `${count} قیمت نیاز به تازه‌سازی دارد` : `${count} prices need refreshing`)
      : rows.length === 0
        ? (isFa ? "قیمت معتبر در دسترس نیست" : "No valid prices available")
        : (isFa ? "قیمت‌ها در بازهٔ اعتبار منبع‌اند" : "Prices are within the source validity window");
  const detail = isError
    ? (isFa ? "دریافت قیمت‌ها انجام نشد؛ دوباره تلاش کنید. اعداد منقضی نمایش داده نمی‌شوند." : "Prices could not be retrieved. Try again; expired values stay hidden.")
    : (isFa ? "اعتبار هر قیمت با زمان دادهٔ منبع بررسی می‌شود؛ دریافت دوباره، عمر داده را تغییر نمی‌دهد." : "Each price is checked against its source timestamp; fetching again does not renew the data's age.");
  return (
    <section className={styles.panel} data-degraded={degraded} aria-label={isFa ? "وضعیت قیمت‌های بازار" : "Market price status"} aria-busy={isFetching}>
      <div className={styles.copy}>
        <Clock3 aria-hidden="true" className={styles.icon} />
        <div><p className={styles.title} role="status" aria-live="polite" aria-atomic="true">{title}</p><p className={styles.detail}>{detail}</p></div>
      </div>
      <button type="button" className={styles.refresh} aria-disabled={isFetching} onClick={() => { if (!isFetching) onRefresh(); }}>
        <RefreshCw aria-hidden="true" />{isFetching ? (isFa ? "در حال دریافت" : "Fetching prices") : (isFa ? "تازه‌سازی قیمت‌ها" : "Refresh prices")}
      </button>
    </section>
  );
}
