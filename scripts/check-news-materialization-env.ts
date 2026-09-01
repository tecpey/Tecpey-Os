import path from "node:path";
import {
  DEFAULT_NEWS_FEED_MAX_ATTEMPTS,
  DEFAULT_NEWS_FEED_MIN_SUCCESSFUL_SOURCES,
  DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS,
} from "../src/lib/news-materialization-runtime-policy";

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.includes("CHANGE_ME")) {
    throw new Error(`${name.toLowerCase()}_required`);
  }
  return value;
}

function optionalAbsoluteDirectory(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return null;
  const normalized = path.normalize(value);
  if (
    !path.isAbsolute(normalized) ||
    normalized === path.parse(normalized).root ||
    normalized.length > 500 ||
    normalized.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return normalized;
}

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

function locales(): string[] {
  const raw = process.env.NEWS_MATERIALIZATION_LOCALES ?? "fa,en";
  const selected = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (selected.length === 0) throw new Error("news_materialization_locales_empty");
  for (const locale of selected) {
    if (locale !== "fa" && locale !== "en") {
      throw new Error("news_materialization_locale_invalid");
    }
  }
  return Array.from(new Set(selected));
}

function sourceMode(): string {
  const value = process.env.NEWS_MATERIALIZATION_SOURCE_MODE ?? "live";
  if (value !== "live" && value !== "fallback" && value !== "manual_seed" && value !== "test") {
    throw new Error("news_materialization_source_mode_invalid");
  }
  return value;
}

try {
  required("DATABASE_URL");
  const selectedLocales = locales();
  const selectedSourceMode = sourceMode();
  const limitPerSource = boundedIntegerEnv("NEWS_MATERIALIZATION_LIMIT_PER_SOURCE", 100, 1, 250);
  const translationConcurrency = boundedIntegerEnv("NEWS_TRANSLATION_CONCURRENCY", 2, 1, 4);
  const translationRetryMinutes = boundedIntegerEnv("NEWS_TRANSLATION_RETRY_MINUTES", 60, 15, 24 * 60);
  const minimumSuccessfulSources = boundedIntegerEnv(
    "NEWS_FEED_MIN_SUCCESSFUL_SOURCES",
    DEFAULT_NEWS_FEED_MIN_SUCCESSFUL_SOURCES,
    1,
    4,
  );
  const feedMaximumAttempts = boundedIntegerEnv(
    "NEWS_FEED_MAX_ATTEMPTS",
    DEFAULT_NEWS_FEED_MAX_ATTEMPTS,
    1,
    3,
  );
  const feedRetryBaseDelayMs = boundedIntegerEnv(
    "NEWS_FEED_RETRY_BASE_DELAY_MS",
    DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS,
    100,
    2_000,
  );
  const stateDirectory = optionalAbsoluteDirectory("TECPEY_OPS_STATE_DIR");
  console.log(JSON.stringify({
    ok: true,
    scheduler: "news-materialization",
    locales: selectedLocales,
    sourceMode: selectedSourceMode,
    limitPerSource,
    translationConcurrency,
    translationRetryMinutes,
    minimumSuccessfulSources,
    feedMaximumAttempts,
    feedRetryBaseDelayMs,
    stateDirectory,
  }));
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
    ? error.message
    : "news_materialization_environment_invalid";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
}
