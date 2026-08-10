import type { SVGProps } from "react";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";

type CoinMark =
  | "bitcoin"
  | "tether"
  | "ethereum"
  | "ton"
  | "solana"
  | "xrp"
  | "bnb"
  | "cardano"
  | "tron"
  | "avalanche"
  | "chainlink"
  | "polkadot"
  | "cosmos"
  | "stellar"
  | "monogram";

type CoinTheme = {
  accent: string;
  mid: string;
  deep: string;
  light: string;
  mark: CoinMark;
};

const coinThemes: Record<string, CoinTheme> = {
  BTC: { accent: "#f7931a", mid: "#f59e0b", deep: "#8a4b07", light: "#fff0c7", mark: "bitcoin" },
  BCH: { accent: "#8dc351", mid: "#22c55e", deep: "#166534", light: "#dcfce7", mark: "bitcoin" },
  USDT: { accent: "#26a17b", mid: "#10b981", deep: "#065f46", light: "#d1fae5", mark: "tether" },
  ETH: { accent: "#627eea", mid: "#7c8ff0", deep: "#243b8f", light: "#dbeafe", mark: "ethereum" },
  TON: { accent: "#0098ea", mid: "#22d3ee", deep: "#075985", light: "#cffafe", mark: "ton" },
  SOL: { accent: "#9945ff", mid: "#14f195", deep: "#312e81", light: "#e9d5ff", mark: "solana" },
  XRP: { accent: "#23292f", mid: "#64748b", deep: "#020617", light: "#e2e8f0", mark: "xrp" },
  DOGE: { accent: "#c2a633", mid: "#facc15", deep: "#854d0e", light: "#fef9c3", mark: "monogram" },
  BNB: { accent: "#f3ba2f", mid: "#facc15", deep: "#854d0e", light: "#fef3c7", mark: "bnb" },
  ADA: { accent: "#0033ad", mid: "#2563eb", deep: "#172554", light: "#dbeafe", mark: "cardano" },
  TRX: { accent: "#ef0027", mid: "#fb7185", deep: "#7f1d1d", light: "#ffe4e6", mark: "tron" },
  AVAX: { accent: "#e84142", mid: "#fb7185", deep: "#991b1b", light: "#fee2e2", mark: "avalanche" },
  LINK: { accent: "#2a5ada", mid: "#60a5fa", deep: "#1e3a8a", light: "#dbeafe", mark: "chainlink" },
  DOT: { accent: "#e6007a", mid: "#f472b6", deep: "#831843", light: "#fce7f3", mark: "polkadot" },
  LTC: { accent: "#345d9d", mid: "#94a3b8", deep: "#1e293b", light: "#e2e8f0", mark: "monogram" },
  NEAR: { accent: "#111827", mid: "#22d3ee", deep: "#020617", light: "#e0f2fe", mark: "monogram" },
  APT: { accent: "#111827", mid: "#64748b", deep: "#020617", light: "#e2e8f0", mark: "monogram" },
  SUI: { accent: "#4da2ff", mid: "#38bdf8", deep: "#075985", light: "#e0f2fe", mark: "monogram" },
  ARB: { accent: "#28a0f0", mid: "#60a5fa", deep: "#1e3a8a", light: "#dbeafe", mark: "monogram" },
  OP: { accent: "#ff0420", mid: "#fb7185", deep: "#7f1d1d", light: "#fee2e2", mark: "monogram" },
  ATOM: { accent: "#2e3148", mid: "#8b5cf6", deep: "#1e1b4b", light: "#ede9fe", mark: "cosmos" },
  PEPE: { accent: "#479e43", mid: "#84cc16", deep: "#365314", light: "#ecfccb", mark: "monogram" },
  SHIB: { accent: "#f05a28", mid: "#fb923c", deep: "#9a3412", light: "#ffedd5", mark: "monogram" },
  FIL: { accent: "#0090ff", mid: "#38bdf8", deep: "#075985", light: "#e0f2fe", mark: "monogram" },
  ICP: { accent: "#f15a24", mid: "#ec4899", deep: "#86198f", light: "#fae8ff", mark: "monogram" },
  INJ: { accent: "#00f2fe", mid: "#22d3ee", deep: "#164e63", light: "#cffafe", mark: "monogram" },
  SEI: { accent: "#e02b2b", mid: "#f97316", deep: "#7c2d12", light: "#ffedd5", mark: "monogram" },
  XLM: { accent: "#111827", mid: "#94a3b8", deep: "#020617", light: "#f8fafc", mark: "stellar" },
  UNI: { accent: "#ff007a", mid: "#f472b6", deep: "#831843", light: "#fce7f3", mark: "monogram" },
  MKR: { accent: "#1aab9b", mid: "#2dd4bf", deep: "#115e59", light: "#ccfbf1", mark: "monogram" },
};

const sizeClass = {
  xs: "h-6 w-6",
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
} as const;

type CryptoAssetIconProps = {
  symbol: string;
  name?: string;
  size?: keyof typeof sizeClass;
  className?: string;
  priorityRing?: boolean;
  assetSrc?: string;
  assetSource?: string;
};

function normalizeSymbol(symbol: string) {
  const compact = symbol.trim().toUpperCase().replace(/[-_/\s]/g, "");
  if (compact.endsWith("USDT") && compact !== "USDT") return compact.slice(0, -4);
  return compact || "TP";
}

function getTheme(symbol: string): CoinTheme {
  return coinThemes[symbol] ?? {
    accent: "#0891b2",
    mid: "#22d3ee",
    deep: "#164e63",
    light: "#cffafe",
    mark: "monogram",
  };
}

function Mark({
  symbol,
  theme,
}: {
  symbol: string;
  theme: CoinTheme;
}) {
  const commonStroke: SVGProps<SVGPathElement> = {
    fill: "none",
    stroke: "white",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 5.4,
  };
  const commonEllipseStroke: SVGProps<SVGEllipseElement> = {
    fill: "none",
    stroke: "white",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (theme.mark) {
    case "bitcoin":
      return (
        <g>
          <text x="48" y="59" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="34" fontWeight="900" fill="white">
            B
          </text>
          <path d="M38 26v40M45 26v40" stroke="white" strokeLinecap="round" strokeWidth="4.4" opacity="0.92" />
        </g>
      );
    case "tether":
      return (
        <g fill="white">
          <rect x="27" y="29" width="42" height="9" rx="4.5" />
          <rect x="43" y="35" width="10" height="30" rx="5" />
          <ellipse cx="48" cy="44" rx="25" ry="7" fill="none" stroke="white" strokeWidth="4.6" />
        </g>
      );
    case "ethereum":
      return (
        <g>
          <path d="M48 17 29 49l19 11 19-11Z" fill="white" opacity="0.98" />
          <path d="M48 64 29 53l19 26 19-26Z" fill="white" opacity="0.72" />
          <path d="M48 17v43l19-11Z" fill={theme.light} opacity="0.72" />
        </g>
      );
    case "ton":
      return (
        <g>
          <path d="M25 30h46L48 74Z" fill="white" opacity="0.95" />
          <path d="M25 30 48 74 36 30Z" fill={theme.light} opacity="0.85" />
          <path d="M71 30 48 74 60 30Z" fill={theme.light} opacity="0.55" />
        </g>
      );
    case "solana":
      return (
        <g fill="white">
          <path d="M31 27h34l-7 8H24Z" />
          <path d="M31 44h34l-7 8H24Z" opacity="0.82" />
          <path d="M31 61h34l-7 8H24Z" opacity="0.68" />
        </g>
      );
    case "xrp":
      return (
        <g>
          <path {...commonStroke} d="M28 29c7 8 12 12 20 12s13-4 20-12" />
          <path {...commonStroke} d="M28 67c7-8 12-12 20-12s13 4 20 12" />
        </g>
      );
    case "bnb":
      return (
        <g fill="white">
          <path d="m48 20 11 11-11 11-11-11Z" />
          <path d="m29 39 11 11-11 11-11-11Z" opacity="0.82" />
          <path d="m67 39 11 11-11 11-11-11Z" opacity="0.82" />
          <path d="m48 58 11 11-11 11-11-11Z" opacity="0.72" />
          <path d="m48 39 11 11-11 11-11-11Z" />
        </g>
      );
    case "cardano":
      return (
        <g fill="white">
          <circle cx="48" cy="48" r="5" />
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return <circle key={angle} cx={48 + Math.cos(rad) * 18} cy={48 + Math.sin(rad) * 18} r="3.7" opacity="0.86" />;
          })}
          {[30, 90, 150, 210, 270, 330].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return <circle key={angle} cx={48 + Math.cos(rad) * 27} cy={48 + Math.sin(rad) * 27} r="2.4" opacity="0.58" />;
          })}
        </g>
      );
    case "tron":
      return <path d="M24 24 72 35 45 75Zm7 8 15 33 19-25Zm3-1 31 8-16 13Z" fill="white" />;
    case "avalanche":
      return (
        <g fill="white">
          <path d="M48 22 68 64H55L48 50 36 76H23Z" />
          <path d="M69 67 74 76H58l-5-9Z" opacity="0.8" />
        </g>
      );
    case "chainlink":
      return <path d="M48 21 70 34v28L48 75 26 62V34Z" fill="none" stroke="white" strokeWidth="7" strokeLinejoin="round" />;
    case "polkadot":
      return (
        <g fill="white">
          <circle cx="48" cy="30" r="6" />
          <circle cx="31" cy="43" r="5" opacity="0.85" />
          <circle cx="65" cy="43" r="5" opacity="0.85" />
          <circle cx="38" cy="65" r="5" opacity="0.68" />
          <circle cx="58" cy="65" r="5" opacity="0.68" />
        </g>
      );
    case "cosmos":
      return (
        <g>
          <ellipse cx="48" cy="48" rx="28" ry="9" {...commonEllipseStroke} strokeWidth={4.2} />
          <ellipse cx="48" cy="48" rx="28" ry="9" {...commonEllipseStroke} strokeWidth={4.2} transform="rotate(60 48 48)" opacity="0.76" />
          <ellipse cx="48" cy="48" rx="28" ry="9" {...commonEllipseStroke} strokeWidth={4.2} transform="rotate(120 48 48)" opacity="0.76" />
          <circle cx="48" cy="48" r="4.5" fill="white" />
        </g>
      );
    case "stellar":
      return (
        <g>
          <path {...commonStroke} d="M29 58 67 35" />
          <path {...commonStroke} d="M27 69 71 43" opacity="0.72" />
          <path d="M34 28a25 25 0 0 1 35 31" fill="none" stroke="white" strokeWidth="5" opacity="0.86" />
        </g>
      );
    case "monogram":
    default:
      return (
        <text x="48" y={symbol.length > 3 ? "56" : "59"} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={symbol.length > 3 ? 20 : 25} fontWeight="900" letterSpacing="-1.2" fill="white">
          {symbol.slice(0, 4)}
        </text>
      );
  }
}

export function CryptoAssetIcon({
  symbol,
  name,
  size = "md",
  className = "",
  priorityRing = false,
  assetSrc,
  assetSource,
}: CryptoAssetIconProps) {
  const normalized = normalizeSymbol(symbol);
  const resolvedAsset = assetSrc
    ? { src: assetSrc, source: assetSource ?? "provided" }
    : getCoinVisualAsset({ symbol: normalized, name });
  const theme = getTheme(normalized);
  const gradientId = `tp-coin-${normalized.toLowerCase()}-face`;
  const rimId = `tp-coin-${normalized.toLowerCase()}-rim`;
  const title = `${name ?? normalized} (${normalized})`;
  const hasPackAsset = Boolean(resolvedAsset.src);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${sizeClass[size]} ${className}`}
      aria-label={title}
      title={title}
    >
      {priorityRing && (
        <span
          aria-hidden="true"
          className="absolute inset-[-10%] rounded-full bg-cyan-300/20 blur-md"
        />
      )}
      {hasPackAsset ? (
        <img
          src={resolvedAsset.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-coin-asset-source={resolvedAsset.source}
          className="relative h-full w-full object-contain drop-shadow-[0_14px_20px_rgba(15,23,42,.20)]"
        />
      ) : (
      <svg className="relative h-full w-full overflow-visible drop-shadow-[0_14px_20px_rgba(15,23,42,.18)]" viewBox="0 0 96 96" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="21" y1="16" x2="76" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={theme.light} />
            <stop offset="0.22" stopColor={theme.accent} />
            <stop offset="0.68" stopColor={theme.mid} />
            <stop offset="1" stopColor={theme.deep} />
          </linearGradient>
          <linearGradient id={rimId} x1="22" y1="20" x2="79" y2="77" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={theme.light} />
            <stop offset="0.45" stopColor={theme.mid} />
            <stop offset="1" stopColor={theme.deep} />
          </linearGradient>
        </defs>
        <ellipse cx="49" cy="78" rx="30" ry="8" fill={theme.deep} opacity="0.22" />
        <circle cx="52" cy="49" r="34" fill={`url(#${rimId})`} opacity="0.72" />
        <circle cx="47" cy="44" r="34" fill={`url(#${gradientId})`} />
        <circle cx="47" cy="44" r="29" fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="2.8" />
        <path d="M24 34c7-16 25-24 42-17 7 3 12 7 16 12C66 23 44 23 28 42Z" fill="white" opacity="0.18" />
        <path d="M73 45c0 18-13 32-31 33 17 4 35-8 40-25 3-10 0-20-6-27 1 6 1 12-3 19Z" fill={theme.deep} opacity="0.26" />
        <g transform="translate(-1 -1)">
          <Mark symbol={normalized} theme={theme} />
        </g>
      </svg>
      )}
    </span>
  );
}
