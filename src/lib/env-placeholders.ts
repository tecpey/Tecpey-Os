/**
 * The single answer to "is this environment value still a template?"
 *
 * `scripts/validate-env.mjs` has carried this list since the environment
 * contract was written, and it is the definition the deployment preflight
 * enforces. When runtime code needs the same question answered — an API key, a
 * webhook URL — it must get the same answer, or a value the preflight accepted
 * can be rejected by the process it just cleared for launch (or worse, the
 * reverse).
 *
 * The list is duplicated in the .mjs preflight because that script runs on plain
 * node with no TypeScript loader, and `env:check` is pinned as an exact string by
 * the support-bundle rehearsal — restructuring it to import this module would
 * break every support bundle. `env-placeholder-authority.test.ts` therefore
 * compares the two literals and fails when either drifts.
 */
export const ENV_PLACEHOLDER_TOKENS: readonly string[] = [
  "CHANGE_ME",
  "your-real",
  "admin-de",
  "wss-dem",
  "REPLACE_WITH",
];

/**
 * Whether a value still carries one of the template markers.
 *
 * Case-insensitive: `change_me` is as unfinished as `CHANGE_ME`, and an operator
 * who lowercased a template has not thereby supplied a credential.
 */
export function containsEnvPlaceholder(raw: string | undefined | null): boolean {
  const value = (raw ?? "").toLowerCase();
  if (!value) return false;
  return ENV_PLACEHOLDER_TOKENS.some((token) => value.includes(token.toLowerCase()));
}
