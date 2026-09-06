const DIGIT_MAP: Readonly<Record<string, string>> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const URL_PATTERN = /https?:\/\/[^\s<>"'\])}]+/giu;
const PLACEHOLDER_PATTERN = /\{[A-Za-z0-9_.-]+\}|%\d*\$?[sdif]/g;
const NUMERIC_PATTERN = /\d[\d.,]*(?:\s*(?:%|bp|bps))?/giu;

export function normalizeLocalizedDigits(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[٠-٩۰-۹०-९]/g, (digit) => DIGIT_MAP[digit] ?? digit)
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%");
}

function normalizeNumericFact(value: string): string {
  return normalizeLocalizedDigits(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "");
}

function sortedMultiset(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function equalMultiset(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedMultiset(left);
  const b = sortedMultiset(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function extractNumericFacts(value: string): string[] {
  const normalized = normalizeLocalizedDigits(value);
  return (normalized.match(NUMERIC_PATTERN) ?? []).map(normalizeNumericFact);
}

export function extractUrls(value: string): string[] {
  return value.match(URL_PATTERN) ?? [];
}

export function extractPlaceholders(value: string): string[] {
  return value.match(PLACEHOLDER_PATTERN) ?? [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleTextForEntityCheck(value: string): string {
  // A brand/symbol occurring only inside a URL or interpolation token does not prove
  // that the translated prose preserved the entity. Strip those machine-owned regions
  // before evaluating protected terminology.
  return value.replace(URL_PATTERN, " ").replace(PLACEHOLDER_PATTERN, " ");
}

function includesProtectedToken(target: string, token: string): boolean {
  const normalizedTarget = visibleTextForEntityCheck(target).normalize("NFKC");
  const normalizedToken = token.normalize("NFKC").trim();
  if (!normalizedToken) return true;

  // Unicode-aware token boundaries prevent symbols such as ETH from passing merely
  // because the letters happen to occur inside an unrelated word (for example method).
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedToken)}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  return pattern.test(normalizedTarget);
}

export type DeterministicLocalizationIntegrity = Readonly<{
  numericIntegrity: boolean;
  urlIntegrity: boolean;
  placeholderIntegrity: boolean;
  protectedTermsIntegrity: boolean;
  missingNumericFacts: readonly string[];
  addedNumericFacts: readonly string[];
  missingUrls: readonly string[];
  missingPlaceholders: readonly string[];
  missingProtectedTerms: readonly string[];
}>;

/**
 * Deterministic lexical floor for localization QA.
 *
 * This deliberately does not claim semantic equivalence. It protects the facts that are
 * easiest to corrupt silently during translation (numbers, URLs, interpolation tokens and
 * product/entity terms) before a semantic/native-fluency evaluator is allowed to approve
 * the localized artifact.
 */
export function assessDeterministicLocalizationIntegrity(input: {
  source: string;
  target: string;
  protectedTerms?: readonly string[];
}): DeterministicLocalizationIntegrity {
  const sourceNumbers = extractNumericFacts(input.source);
  const targetNumbers = extractNumericFacts(input.target);
  const sourceUrls = extractUrls(input.source);
  const targetUrls = extractUrls(input.target);
  const sourcePlaceholders = extractPlaceholders(input.source);
  const targetPlaceholders = extractPlaceholders(input.target);
  const protectedTerms = input.protectedTerms ?? [];

  const missingNumericFacts = sourceNumbers.filter(
    (fact) => !targetNumbers.includes(fact),
  );
  const addedNumericFacts = targetNumbers.filter(
    (fact) => !sourceNumbers.includes(fact),
  );
  const missingUrls = sourceUrls.filter((url) => !targetUrls.includes(url));
  const missingPlaceholders = sourcePlaceholders.filter(
    (placeholder) => !targetPlaceholders.includes(placeholder),
  );
  const missingProtectedTerms = protectedTerms.filter(
    (term) => !includesProtectedToken(input.target, term),
  );

  return {
    numericIntegrity: equalMultiset(sourceNumbers, targetNumbers),
    urlIntegrity: equalMultiset(sourceUrls, targetUrls),
    placeholderIntegrity: equalMultiset(sourcePlaceholders, targetPlaceholders),
    protectedTermsIntegrity: missingProtectedTerms.length === 0,
    missingNumericFacts,
    addedNumericFacts,
    missingUrls,
    missingPlaceholders,
    missingProtectedTerms,
  };
}
