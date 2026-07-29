/**
 * Runtime feature flag system.
 * Flags are controlled by environment variables — no hardcoded booleans.
 * Default values represent the production-safe baseline (conservative: new features off).
 */

/** All supported platform feature flags. */
export type FeatureFlag =
  | "academy.enabled"
  | "exchange.enabled"
  | "social.enabled"
  | "mentor.enabled"
  | "future.marketplace.enabled";

type FlagConfig = {
  envVar: string;
  /** Whether the feature is ON when the env var is absent. */
  defaultEnabled: boolean;
};

const FLAG_CONFIG: Record<FeatureFlag, FlagConfig> = {
  "academy.enabled": { envVar: "FEATURE_ACADEMY_ENABLED", defaultEnabled: true },
  "exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: true },
  "social.enabled": { envVar: "FEATURE_SOCIAL_ENABLED", defaultEnabled: false },
  "mentor.enabled": { envVar: "FEATURE_MENTOR_ENABLED", defaultEnabled: true },
  "future.marketplace.enabled": { envVar: "FEATURE_MARKETPLACE_ENABLED", defaultEnabled: false },
};

/**
 * Returns whether a feature flag is currently enabled.
 * Explicit "true" / "false" env var values override the default.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = FLAG_CONFIG[flag];
  const value = process.env[config.envVar];
  if (value === "true") return true;
  if (value === "false") return false;
  return config.defaultEnabled;
}

/** Returns a snapshot of all current flag values. Useful for health/debug endpoints. */
export function getAllFlags(): Record<FeatureFlag, boolean> {
  return Object.fromEntries(
    (Object.keys(FLAG_CONFIG) as FeatureFlag[]).map((flag) => [flag, isFeatureEnabled(flag)]),
  ) as Record<FeatureFlag, boolean>;
}
