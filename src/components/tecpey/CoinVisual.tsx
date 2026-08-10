import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";

type CoinVisualProps = {
  symbol?: unknown;
  slug?: string;
  name?: string;
  faName?: string;
  remoteIcon?: string;
  locale?: "fa" | "en";
  priority?: boolean;
  variant?: "cover" | "thumb" | "avatar" | "icon";
  className?: string;
};

const variantClass = {
  cover: "aspect-[16/10] w-full rounded-[26px]",
  thumb: "h-16 w-20 rounded-2xl",
  avatar: "h-10 w-10 rounded-2xl",
  icon: "h-6 w-6 rounded-full",
};

export function CoinVisual({
  symbol,
  slug,
  name,
  faName,
  remoteIcon,
  locale = "fa",
  priority = false,
  variant = "cover",
  className = "",
}: CoinVisualProps) {
  const asset = getCoinVisualAsset({ symbol, slug, name, faName, remoteIcon });
  const label = locale === "fa" ? asset.faName : asset.name;
  const isCover = variant === "cover";

  return (
    <span
      data-coin-visual={asset.symbol}
      data-coin-asset-source={asset.source}
      className={`relative block shrink-0 overflow-hidden border border-cyan-300/20 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,.18),transparent_24%),radial-gradient(circle_at_72%_72%,rgba(34,211,238,.24),transparent_34%),linear-gradient(145deg,#06111f,#0f172a)] shadow-[0_18px_48px_rgba(8,145,178,.16)] ${variantClass[variant]} ${className}`}
      role="img"
      aria-label={`${label} (${asset.symbol})`}
      title={`${label} (${asset.symbol})`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.12),transparent_38%),radial-gradient(circle_at_50%_120%,rgba(14,165,233,.28),transparent_48%)]" />
      <span className="absolute left-5 top-5 h-16 w-16 rounded-full border border-white/10 bg-white/5 blur-sm" aria-hidden="true" />
      <span className="absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-cyan-400/15 blur-2xl" aria-hidden="true" />
      <span className={`absolute ${isCover ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : "inset-0 grid place-items-center"}`}>
        <CryptoAssetIcon
          symbol={asset.symbol}
          name={asset.name}
          size={variant === "cover" ? "xl" : variant === "thumb" ? "lg" : variant === "icon" ? "xs" : "sm"}
          priorityRing={priority || isCover}
          assetSrc={asset.src}
          assetSource={asset.source}
        />
      </span>
      {isCover ? (
        <span className="absolute bottom-3 right-3 rounded-2xl border border-white/20 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-white shadow-lg backdrop-blur">
          {asset.symbol}
        </span>
      ) : null}
    </span>
  );
}
