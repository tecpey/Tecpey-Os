export const FULL_EVIDENCE_MIN_SOURCE_BODY_CHARS = 1_200;
export const FULL_EVIDENCE_HARD_MIN_RATIO = 0.45;

function compact(value: string, max = 20_000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * This is a gross-compression guard, not a word-count target.
 *
 * Persian and English have different character density, so the hard floor is
 * deliberately below the editorial target. Its job is only to prevent a full
 * publisher article from silently collapsing into a lead-sized digest.
 */
export function minimumFullEvidencePersianBodyChars(sourceBody: string): number {
  const sourceLength = compact(sourceBody).length;
  if (sourceLength < FULL_EVIDENCE_MIN_SOURCE_BODY_CHARS) return 0;
  return Math.floor(sourceLength * FULL_EVIDENCE_HARD_MIN_RATIO);
}

export function isFullEvidencePersianBodyComplete(input: {
  sourceBody: string;
  translatedBody: string;
}): boolean {
  const minimum = minimumFullEvidencePersianBodyChars(input.sourceBody);
  if (minimum === 0) return true;
  return compact(input.translatedBody).length >= minimum;
}
