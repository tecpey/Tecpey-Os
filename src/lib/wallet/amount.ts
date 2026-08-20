const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const EXPONENTIAL_PATTERN = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;
const ATOMIC_PATTERN = /^\d+$/;

function expandExponentialDecimal(value: string): string {
  const match = value.match(EXPONENTIAL_PATTERN);
  if (!match) return value;
  const coefficient = match[1];
  const fraction = match[2] ?? "";
  const exponent = Number.parseInt(match[3], 10);
  const digits = `${coefficient}${fraction}`;
  const decimalIndex = coefficient.length + exponent;
  if (decimalIndex <= 0) return `0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  if (decimalIndex >= digits.length) return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export function parseDecimalToAtomicUnits(value: string, decimals: number): bigint {
  const normalized = expandExponentialDecimal(value.trim());
  const match = normalized.match(DECIMAL_PATTERN);
  if (!match) throw new Error("amount_decimal_invalid");
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new Error("amount_decimal_precision_exceeded");
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}

export function parseAtomicOrDecimalAmountInput(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (/[.eE]/.test(normalized)) return parseDecimalToAtomicUnits(normalized, decimals);
  if (!ATOMIC_PATTERN.test(normalized)) throw new Error("amount_atomic_invalid");
  return BigInt(normalized);
}

export function formatAtomicUnits(value: bigint, decimals: number, places = decimals): string {
  if (value < BigInt(0)) throw new Error("amount_atomic_negative");
  const base = BigInt(10) ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").slice(0, places);
  return places > 0 ? `${whole.toString()}.${fraction.padEnd(places, "0")}` : whole.toString();
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) throw new Error("ceil_div_denominator_invalid");
  return (numerator + denominator - BigInt(1)) / denominator;
}

export function multiplyByBasisPointsCeil(value: bigint, basisPoints: bigint): bigint {
  return ceilDiv(value * basisPoints, BigInt(10_000));
}
