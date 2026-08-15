import { readFile, readdir } from "node:fs/promises";

// Strict revocation is a ratchet. Every route enrolled here must keep
// `strictRevocation: true`, and — enforced below — every route that requests it
// must be enrolled. This list previously held 9 entries while 43 routes actually
// used strict revocation, so 34 of them (including withdrawals, orders and API
// keys) could have lost it silently without any gate failing.
const directStrictFiles = [
  "src/app/api/academy-auth/route.ts",
  "src/app/api/academy-certificates/route.ts",
  "src/app/api/academy-credential-appeals/route.ts",
  "src/app/api/academy-credential-visibility/route.ts",
  "src/app/api/academy-flashcards/route.ts",
  "src/app/api/academy-lesson-assessment/route.ts",
  "src/app/api/academy-lesson-progress/route.ts",
  "src/app/api/academy-mastery-seasons/route.ts",
  "src/app/api/academy-reflections/route.ts",
  "src/app/api/academy-simulator-decision/route.ts",
  "src/app/api/academy-state/route.ts",
  "src/app/api/academy-student-profile/route.ts",
  "src/app/api/academy-term-progress/route.ts",
  "src/app/api/achievements/route.ts",
  "src/app/api/arena/leaderboard/route.ts",
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/api-keys/[id]/route.ts",
  "src/app/api/api-keys/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/2fa/verify/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/devices/route.ts",
  "src/app/api/auth/password/change/route.ts",
  "src/app/api/auth/sessions/[id]/route.ts",
  "src/app/api/auth/sessions/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/credentials/route.ts",
  "src/app/api/auth/webauthn/register/challenge/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/auth/withdraw/[id]/route.ts",
  "src/app/api/auth/withdraw/authorize/route.ts",
  "src/app/api/auth/withdraw/route.ts",
  "src/app/api/community/journal-discipline-score/route.ts",
  "src/app/api/community/profile/route.ts",
  "src/app/api/community/reputation-evidence/route.ts",
  "src/app/api/device-token/route.ts",
  "src/app/api/learning-events/route.ts",
  "src/app/api/mentor-conversations/migrate/route.ts",
  "src/app/api/mentor-conversations/route.ts",
  "src/app/api/mentor-challenge/route.ts",
  "src/app/api/mentor-insights/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/mentor-preferences/route.ts",
  "src/app/api/mentor-profile/recompute/route.ts",
  "src/app/api/notification-brain/route.ts",
  "src/app/api/notifications/consent/route.ts",
  "src/app/api/notifications/preferences/route.ts",
  "src/app/api/notifications/read/route.ts",
  "src/app/api/notifications/route.ts",
  "src/app/api/offline-sync/route.ts",
  "src/app/api/orders/[id]/route.ts",
  "src/app/api/orders/route.ts",
  "src/app/api/trading-arena/execution/route.ts",
  "src/app/api/trading-arena/reflections/route.ts",
  "src/app/api/trading-arena/route.ts",
];
const sources = new Map(
  await Promise.all(
    directStrictFiles.map(async (path) => [
      path,
      await readFile(path, "utf8").catch(() => null),
    ]),
  ),
);
const failures = [];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The invariant is per handler, not per file. A read handler may use the
// non-strict session — it tolerates the short revocation cache — but every
// mutating handler must resolve identity with `strictRevocation: true`. Several
// governed routes legitimately serve a non-strict GET alongside a strict POST,
// so a file-wide ban on the non-strict call would be wrong.
function handlerBlocks(source) {
  const pattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
  const found = [...source.matchAll(pattern)];
  return found.map((match, index) => ({
    method: match[1],
    body: source.slice(match.index, found[index + 1]?.index ?? source.length),
  }));
}

for (const [path, source] of sources) {
  if (source === null) continue;
  if (!source.includes("strictRevocation: true")) {
    failures.push(`${path}: strict revocation evidence is missing`);
    continue;
  }
  for (const { method, body } of handlerBlocks(source)) {
    if (!MUTATING_METHODS.has(method)) continue;
    if (!body.includes("getCanonicalSession(")) continue;
    if (!body.includes("strictRevocation: true")) {
      failures.push(
        `${path}: ${method} resolves identity without strict revocation`,
      );
    }
  }
}

// Drift detection. A hand-maintained enrollment list cannot notice a route that
// starts using strict revocation, and an unenrolled route is one nobody guards.
const enrolled = new Set(directStrictFiles);
const apiRoutes = (await readdir("src/app/api", { recursive: true }))
  .filter((entry) => entry.endsWith("route.ts"))
  .map((entry) => `src/app/api/${entry.replaceAll("\\", "/")}`)
  .sort();

for (const path of apiRoutes) {
  if (enrolled.has(path)) continue;
  const source = await readFile(path, "utf8");
  if (source.includes("strictRevocation: true")) {
    failures.push(
      `${path}: requests strict revocation but is not enrolled in the strict revocation inventory`,
    );
  }
}
for (const path of enrolled) {
  if (!apiRoutes.includes(path)) {
    failures.push(`${path}: enrolled for strict revocation but no longer exists`);
  }
}

const alias = await readFile("src/app/api/ai-mentor-v2/route.ts", "utf8");
if (!alias.includes("POST as canonicalPost")) {
  failures.push("AI Mentor V2 must delegate POST to the canonical strict handler");
}

const adminLogout = await readFile("src/app/api/command-center/auth/logout/route.ts", "utf8");
if (!adminLogout.includes("loadAdminPrincipal(req)")) {
  failures.push("admin logout must resolve the live database principal");
}

const notificationPrincipal = await readFile("src/lib/notifications/principal.ts", "utf8");
if (!notificationPrincipal.includes("getCanonicalSession(request")) {
  failures.push("notification identity must use canonical session authority");
}
if (!notificationPrincipal.includes("options.strictRevocation === true")) {
  failures.push("notification identity must expose strict revocation mode");
}
for (const path of [
  "src/app/api/notifications/consent/route.ts",
  "src/app/api/notifications/preferences/route.ts",
]) {
  const source = await readFile(path, "utf8");
  if (!source.includes("strictRevocation: true")) {
    failures.push(`${path}: sensitive notification mutation must request strict identity`);
  }
}

const community = await readFile("src/app/api/community/profile/route.ts", "utf8");
for (const invariant of [
  "resolveTenantPrincipalContext",
  'scopes: ["community:profile:write"]',
  "updateCommunityProfileConsent",
  'req.headers.get("idempotency-key")',
]) {
  if (!community.includes(invariant)) {
    failures.push(`community profile mutation is missing ${invariant}`);
  }
}
for (const forbidden of [
  "setPublicVisibilityForStudent",
  "setCurrentPublicVisibility",
]) {
  if (community.includes(forbidden)) {
    failures.push(`community mutation may not use legacy identity or visibility setter ${forbidden}`);
  }
}

const detector = await readFile("scripts/api-security-runtime-evidence.mjs", "utf8");
if (!detector.includes("detectStrictRevocationCall")) {
  failures.push("runtime evidence must expose strict revocation detection");
}
if (!detector.includes("loadAdminPrincipal")) {
  failures.push("runtime evidence must recognize live admin principal authority");
}

if (failures.length) {
  console.error("Strict revocation authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Strict revocation authority check passed for all governed mutations.");
