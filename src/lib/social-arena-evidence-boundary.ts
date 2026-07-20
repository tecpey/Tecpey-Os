export const FORBIDDEN_BROWSER_OFFICIAL_EVIDENCE_FIELDS = new Set([
  "score",
  "disciplineScore",
  "pnl",
  "pnlPct",
  "realizedPnl",
  "id",
  "evidenceId",
  "tradeId",
  "createdAt",
  "completedAt",
  "timestamp",
  "completed",
  "completionStatus",
]);

export type BrowserOfficialEvidenceCheck =
  | { ok: true }
  | { ok: false; field: string; path: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Rejects browser payloads that attempt to define official evidence identity,
 * timing, completion, score or financial outcome. Descriptive user input may
 * still be accepted by the domain route and normalized by a server authority.
 */
export function checkBrowserOfficialEvidencePayload(
  value: unknown,
  path = "payload",
): BrowserOfficialEvidenceCheck {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = checkBrowserOfficialEvidencePayload(value[index], `${path}[${index}]`);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }

  const row = record(value);
  if (!row) return { ok: true };
  for (const [field, nestedValue] of Object.entries(row)) {
    const fieldPath = `${path}.${field}`;
    if (FORBIDDEN_BROWSER_OFFICIAL_EVIDENCE_FIELDS.has(field)) {
      return { ok: false, field, path: fieldPath };
    }
    const nested = checkBrowserOfficialEvidencePayload(nestedValue, fieldPath);
    if (!nested.ok) return nested;
  }
  return { ok: true };
}

export function assertBrowserCannotDefineOfficialEvidence(value: unknown): void {
  const result = checkBrowserOfficialEvidencePayload(value);
  if (!result.ok) {
    throw new Error(`browser_official_evidence_forbidden:${result.path}`);
  }
}
