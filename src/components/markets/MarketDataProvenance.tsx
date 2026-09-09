import type { MarketDataProvenance } from "@/types/market";

type MarketDataProvenanceProps = {
  provenance?: MarketDataProvenance;
  locale: "fa" | "en";
};

const PROVIDER_LINKS: Readonly<Record<string, string>> = Object.freeze({
  bitycle: "https://bitycle.com/",
  coingecko: "https://www.coingecko.com/",
});

const COPY = {
  fa: {
    source: "منبع داده بازار",
    upstream: "سورس",
    updated: "زمان داده",
    currency: "مبنای قیمت",
    fallback: "مسیر پشتیبان فعال",
  },
  en: {
    source: "Market data source",
    upstream: "Upstream",
    updated: "Data timestamp",
    currency: "Quote",
    fallback: "Fallback active",
  },
} as const;

function compactText(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/gu, " ").slice(0, max);
  return text || null;
}

function timestampLabel(value: unknown, locale: "fa" | "en"): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function MarketDataProvenance({
  provenance,
  locale,
}: MarketDataProvenanceProps) {
  const provider = compactText(provenance?.provider);
  if (!provider) return null;

  const text = COPY[locale];
  const providerHref = PROVIDER_LINKS[provider.toLowerCase()];
  const upstream = compactText(provenance?.upstreamSource);
  const currency = compactText(provenance?.currency, 20);
  const updated = timestampLabel(
    provenance?.upstreamUpdatedAt ?? provenance?.fetchedAt,
    locale,
  );

  return (
    <p
      className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] font-bold text-muted"
      role="status"
      aria-live="polite"
    >
      <span>{text.source}:</span>
      {providerHref ? (
        <a
          href={providerHref}
          target="_blank"
          rel="noreferrer"
          className="font-black text-primary underline underline-offset-4"
        >
          {provider}
        </a>
      ) : (
        <strong className="font-black text-foreground">{provider}</strong>
      )}
      {upstream ? <span>· {text.upstream}: {upstream}</span> : null}
      {currency ? <span>· {text.currency}: {currency}</span> : null}
      {updated ? <span>· {text.updated}: {updated}</span> : null}
      {provenance?.fallback === true ? (
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-black text-amber-600 dark:text-amber-300">
          {text.fallback}
        </span>
      ) : null}
    </p>
  );
}
