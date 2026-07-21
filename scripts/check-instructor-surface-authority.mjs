import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const files = {
  page: "src/app/academy/community/instructor/page.tsx",
  dormantDashboard:
    "src/components/academy/community/InstructorDashboard.tsx",
  inventory: "docs/security/social-arena-evidence-inventory.json",
  policy: "docs/academy/COMMUNITY_INSTRUCTOR_ACCESS_BOUNDARY.md",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ]),
  ),
);
const inventory = JSON.parse(content.inventory);
const failures = [];

function requireText(target, token, reason) {
  if (!content[target].includes(token)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (content[target].includes(token)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

function normalizedPath(path) {
  return relative(".", path).split(sep).join("/");
}

for (const forbidden of [
  '"use client"',
  "InstructorDashboard",
  "fetchBehavioralSnapshot",
  "behavioral-client",
  "behavioral-snapshot",
  "/api/",
  "fetch(",
  "useEffect",
  "useState",
  "localStorage",
  "sessionStorage",
  "@/lib/community-profile",
  "@/lib/community-leaderboard",
  "@/lib/trading-arena",
  "@/lib/trading-journal",
  "studentId",
  "instructor_review_consent",
]) {
  rejectText(
    "page",
    forbidden,
    `launch-disabled Instructor route contains forbidden authority: ${forbidden}`,
  );
}

for (const invariant of [
  'title: "دسترسی مدرس هنوز فعال نیست | جامعه تک‌پی"',
  "robots: { index: false, follow: false }",
  "دسترسی مدرس غیرفعال",
  "فضای مدرس هنوز راه‌اندازی نشده است",
  "هیچ نقش مدرس، فهرست دانشجو یا مجوز مشاهده‌ای",
  "بینش‌های شخصی و snapshot رفتاری فقط برای خود کاربر هستند",
  'href="/academy/community"',
  'href="/academy"',
]) {
  requireText(
    "page",
    invariant,
    `Instructor unavailable boundary is missing: ${invariant}`,
  );
}

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "@/lib/community-profile",
  "@/lib/community-leaderboard",
  "@/lib/trading-arena",
  "@/lib/trading-journal",
]) {
  rejectText(
    "dormantDashboard",
    forbidden,
    `dormant compatibility dashboard contains forbidden browser authority: ${forbidden}`,
  );
}
requireText(
  "dormantDashboard",
  "fetchBehavioralSnapshot",
  "dormant dashboard must remain an explicitly bounded historical self-view until deleted",
);
requireText(
  "dormantDashboard",
  "اشتراک واقعی با مدرس",
  "dormant dashboard must continue to state that Instructor sharing is disabled",
);

if (inventory.instructorFollowUpIssue !== 250) {
  failures.push(
    `${files.inventory}: Instructor follow-up issue must remain bound to #250`,
  );
}
if (
  inventory.policy?.instructorAccess !==
  "launch-disabled static boundary; private self behavioral insights are not instructor disclosures; activation requires verified instructor role plus explicit scoped student grant, tenant/program isolation, expiry/revocation and transaction-coupled access evidence"
) {
  failures.push(`${files.inventory}: Instructor access policy drifted`);
}

const routeEntry = inventory.consumers?.find(
  (entry) => entry.path === files.page,
);
if (
  routeEntry?.classification !== "launch-disabled-static-boundary" ||
  !routeEntry.allowedAuthority?.includes("no behavioral")
) {
  failures.push(
    `${files.inventory}: active Instructor route must remain a static no-evidence boundary`,
  );
}
const dormantEntry = inventory.consumers?.find(
  (entry) => entry.path === files.dormantDashboard,
);
if (
  dormantEntry?.classification !== "quarantined-dormant-self-preview" ||
  !dormantEntry.allowedAuthority?.includes("zero active source importers")
) {
  failures.push(
    `${files.inventory}: compatibility dashboard must remain explicitly dormant`,
  );
}
if (!inventory.protectedAuthoritySurfaces?.includes(files.page)) {
  failures.push(`${files.inventory}: Instructor route is missing from protected surfaces`);
}

for (const invariant of [
  "community-instructor-access-boundary-v1",
  "Launch-disabled / no active Instructor access authority",
  "is a self-view authority for the currently authenticated student",
  "Consent is not a grant",
  "zero active source importers",
  "verified Instructor/staff role",
  "explicit student-to-Instructor grant",
  "issue, expiry and revocation timestamps from PostgreSQL",
  "transaction-coupled grant, revoke and access evidence",
  "no hidden scoring, reward, scholarship, Mentor or disciplinary outcome",
  "noindex, nofollow",
]) {
  requireText(
    "policy",
    invariant,
    `Instructor access policy is missing: ${invariant}`,
  );
}

const externalReferences = [];
for (const path of await listSourceFiles("src")) {
  const sourcePath = normalizedPath(path);
  if (
    sourcePath === files.dormantDashboard ||
    sourcePath.includes("/tests/") ||
    sourcePath.includes("/stubs/")
  ) {
    continue;
  }
  const source = await readFile(path, "utf8");
  if (/\bInstructorDashboard\b/.test(source)) {
    externalReferences.push(sourcePath);
  }
}
if (externalReferences.length > 0) {
  failures.push(
    `${files.dormantDashboard}: dormant dashboard is actively referenced by ${externalReferences.join(", ")}`,
  );
}

if (failures.length > 0) {
  console.error("Instructor surface authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Instructor surface authority passed: the public route is static, noindex and evidence-free; the historical self-view dashboard has zero active source importers; real Instructor access remains launch-disabled pending verified role and scoped student grant authority.",
);
