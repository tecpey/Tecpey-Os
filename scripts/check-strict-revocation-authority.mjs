import { readFile } from "node:fs/promises";

const directStrictFiles = [
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/community/profile/route.ts",
];
const sources = new Map(
  await Promise.all(
    directStrictFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);
const failures = [];
for (const [path, source] of sources) {
  if (!source.includes("strictRevocation: true")) {
    failures.push(`${path}: strict revocation evidence is missing`);
  }
  if (source.includes("getCanonicalSession(req);")) {
    failures.push(`${path}: non-strict canonical session call remains`);
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
