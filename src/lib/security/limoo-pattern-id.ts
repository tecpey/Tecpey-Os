const LIMOO_PATTERN_ID = /^\d{1,19}$/;
const LIMOO_PATTERN_ID_MIN = BigInt(1);
const LIMOO_PATTERN_ID_MAX = BigInt("9223372036854775807");

export function normalizeLimooPatternId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) return null;
  } else if (typeof value !== "string" && typeof value !== "bigint") {
    return null;
  }

  const text = String(value).trim();
  if (!LIMOO_PATTERN_ID.test(text)) return null;
  const parsed = BigInt(text);
  return parsed >= LIMOO_PATTERN_ID_MIN && parsed <= LIMOO_PATTERN_ID_MAX
    ? parsed.toString()
    : null;
}
