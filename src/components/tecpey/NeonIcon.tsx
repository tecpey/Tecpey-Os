import type { LucideIcon } from "lucide-react";

type PremiumIconSize = "xs" | "sm" | "md" | "lg";
type PremiumIconTone = "brand" | "success" | "warning" | "danger" | "neutral";

type PremiumIconProps = {
  icon: LucideIcon;
  size?: PremiumIconSize;
  tone?: PremiumIconTone;
  label?: string;
  className?: string;
};

export function PremiumIcon({
  icon: Icon,
  size = "md",
  tone = "brand",
  label,
  className = "",
}: PremiumIconProps) {
  const iconSizes = {
    xs: "h-4 w-4",
    sm: "h-5 w-5",
    md: "h-7 w-7",
    lg: "h-8 w-8",
  };

  return (
    <span
      className={`tecpey-icon-shell ${className}`.trim()}
      data-size={size}
      data-tone={tone}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon className={iconSizes[size]} aria-hidden="true" />
    </span>
  );
}

/**
 * Backwards-compatible name for existing surfaces. The visual treatment is now
 * the restrained TecPey premium icon material rather than an outer neon glow.
 */
export function NeonIcon(props: PremiumIconProps) {
  return <PremiumIcon {...props} />;
}
