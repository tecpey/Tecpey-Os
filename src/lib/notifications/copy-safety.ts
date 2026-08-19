import patterns from "./copy-safety-patterns.json";

// Runtime enforcement of the notification copy-safety non-negotiable
// (docs/engineering/governance/TECPEY_PRODUCT_COMPLETION_AND_C_LEVEL_GOVERNANCE.md):
//
//   "Do not use notification hooks that promise profit, induce panic, or push
//    reckless trading behavior."
//
// The CI guard (scripts/check-notification-copy-safety.mjs) catches forbidden
// language authored directly into notification source copy. This module closes
// the complementary gap: notification title/body assembled at runtime from
// event payload fields (e.g. an academy credential title read from the database)
// never passes through the source scanner, so a forbidden phrase injected into
// such a field would otherwise reach users unchecked. Enforcing here — at the
// single governed creation boundary — fails those closed regardless of source.
//
// Both layers compile the SAME rules from copy-safety-patterns.json, so the two
// enforcement points can never drift apart.

type CopySafetyRule = {
  category: string;
  reason: string;
  patterns: string[];
};

const RULES: readonly { category: string; reason: string; regexes: RegExp[] }[] =
  (patterns.rules as CopySafetyRule[]).map((rule) => ({
    category: rule.category,
    reason: rule.reason,
    regexes: rule.patterns.map((source) => new RegExp(source, "i")),
  }));

export type ForbiddenNotificationCopy = {
  category: string;
  reason: string;
  match: string;
};

/**
 * Return the first forbidden-copy hit in the given text, or null when clean.
 */
export function findForbiddenNotificationCopy(
  value: string,
): ForbiddenNotificationCopy | null {
  for (const rule of RULES) {
    for (const regex of rule.regexes) {
      const found = value.match(regex);
      if (found) {
        return { category: rule.category, reason: rule.reason, match: found[0] };
      }
    }
  }
  return null;
}

/**
 * Fail closed if any user-facing notification field carries forbidden copy.
 * Throws `notification_copy_unsafe` so the surrounding domain transaction aborts
 * rather than persisting or delivering unsafe copy.
 */
export function assertSafeNotificationCopy(fields: {
  title: string;
  body: string;
}): void {
  for (const [field, value] of Object.entries(fields)) {
    const hit = findForbiddenNotificationCopy(value);
    if (hit) {
      throw new Error(
        `notification_copy_unsafe:${field}:${hit.category}`,
      );
    }
  }
}
