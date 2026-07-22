import { existsSync, readFileSync } from "node:fs";

const failures = [];
const read = (path) => readFileSync(path, "utf8");
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message);
};

const packageJson = JSON.parse(read("package.json"));
if (packageJson.devDependencies?.["@playwright/test"] !== "1.61.1") {
  failures.push("@playwright/test must remain exactly pinned to 1.61.1");
}
if (
  packageJson.scripts?.["browser:check"] !==
  "node scripts/check-browser-golden-path-authority.mjs"
) {
  failures.push("browser:check script is missing or changed");
}
if (packageJson.scripts?.["test:browser"] !== "playwright test") {
  failures.push("test:browser script is missing or changed");
}
requireText(
  packageJson.scripts?.["release:check"] ?? "",
  "npm run browser:check",
  "release:check must include the browser authority source guard",
);

for (const path of [
  "playwright.config.ts",
  "src/tests/browser/public-golden-path.spec.ts",
  "src/tests/browser/mentor-profile-ready.spec.ts",
  ".github/workflows/browser-golden-path.yml",
  "docs/ui/PUBLIC_BROWSER_GOLDEN_PATH.md",
]) {
  if (!existsSync(path)) failures.push(`required browser QA file missing: ${path}`);
}
for (const path of [
  ".github/workflows/browser-lock-bootstrap.yml",
  ".github/workflows/browser-runtime-fix.yml",
  ".github/workflows/browser-functional-fix.yml",
  ".github/workflows/browser-nav-copy-fix.yml",
  ".github/workflows/browser-golden-path-fix-bootstrap.yml",
  ".github/workflows/browser-review-hardening.yml",
  ".github/workflows/browser-product-hardening-v2.yml",
  "scripts/apply-browser-golden-path-patch.py",
  "scripts/apply-browser-runtime-fixes.py",
  "scripts/apply-browser-functional-fixes.py",
  "scripts/apply-browser-golden-path-fixes.py",
]) {
  if (existsSync(path)) {
    failures.push(`temporary browser patch asset must not enter main: ${path}`);
  }
}

const config = read("playwright.config.ts");
for (const token of [
  "chromium-desktop",
  "firefox-desktop",
  "chromium-mobile",
  "firefox-mobile",
  "npm run build && npm run start",
  'NODE_ENV: "production"',
  'REDIS_URL: "redis://127.0.0.1:6379"',
  'TECPEY_REAL_WITHDRAWALS_ENABLED: "0"',
  'TECPEY_CUSTODY_KILL_SWITCH: "1"',
  "retain-on-failure",
  "only-on-failure",
]) {
  requireText(config, token, `Playwright configuration missing ${token}`);
}
if (config.includes("npm run dev")) {
  failures.push(
    "browser acceptance must use the governed production custom-server path, not the development server",
  );
}

const spec = read("src/tests/browser/public-golden-path.spec.ts");
for (const token of [
  "/api/academy-auth",
  "/api/academy-student-profile",
  'type ProfileMode = "absent" | "ready" | "unavailable"',
  "IntersectionObserver",
  "مرکز دانش",
  "Knowledge Center",
  "تریدینگ آرنا",
  "Trading Arena",
  "آشنایی با منتور هوشمند آموزشی تک‌پی",
  "Discover TecPey AI learning mentor",
  "از مربی آموزشی تک‌پی بپرس",
  "Ask TecPey learning mentor",
  "Profile service outage fails closed",
  "expectProtectedArenaRedirects",
  "scrollWidth",
  'localStorage.getItem("theme")',
  'button[aria-label*="تغییر به حالت"]:visible',
  "expectCanonicalAuthLinks",
  "tecpey.irhttps://",
  "۲۴ ساعته",
  "Market access activation",
  "toHaveCount(0)",
]) {
  requireText(spec, token, `browser Golden Path coverage missing ${token}`);
}

const profileReadySpec = read("src/tests/browser/mentor-profile-ready.spec.ts");
for (const token of [
  "Profile-ready learner receives only the personalized Mentor launcher",
  'name: "از مربی آموزشی تک‌پی بپرس"',
  'name: "آشنایی با منتور هوشمند آموزشی تک‌پی"',
  'page.getByText("پرونده یادگیری"',
  'page.getByText("ساخت پروفایل آکادمی"',
  "toHaveCount(1)",
  "toHaveCount(0)",
]) {
  requireText(
    profileReadySpec,
    token,
    `profile-ready Mentor browser coverage missing ${token}`,
  );
}

const workflow = read(".github/workflows/browser-golden-path.yml");
for (const token of [
  "push:",
  "pull_request:",
  "image: redis:7-alpine",
  "image: postgres:16-alpine",
  "npm ci",
  "npm run browser:check",
  "npm run db:migrate",
  "npm run build",
  "playwright install --with-deps chromium firefox",
  "npm run test:browser",
  "if: failure()",
  "retention-days: 3",
]) {
  requireText(workflow, token, `browser workflow missing ${token}`);
}
if (/^\s+paths:\s*$/m.test(workflow)) {
  failures.push(
    "Browser Golden Path must be a permanent all-PR/main gate, not a path-filtered optional workflow",
  );
}

const rootLayout = read("src/app/layout.tsx");
for (const token of [
  "REQUEST_ROUTE_CONTEXT_HEADER",
  'requestHeaders.get("x-nonce")',
  'lang={isEnglishPath ? "en-US" : "fa-IR"}',
  'dir={isEnglishPath ? "ltr" : "rtl"}',
  "<ThemeProvider nonce={nonce}>",
  "TecPey Financial Education Platform",
  "Financial Education and Virtual Trading Practice",
  '"@type": "EducationalOrganization"',
  "آموزش رمزارز، تریدینگ آرنا و منتور هوشمند",
  "تمرین معامله با سرمایه مجازی",
  "سواد مالی دیجیتال",
]) {
  requireText(rootLayout, token, `server locale/metadata boundary missing: ${token}`);
}
for (const forbidden of [
  "TecPey Crypto Exchange",
  '"@type": "FinancialService"',
  "تک‌پی | صرافی رمزارز امن، سریع و شفاف",
  "تک‌پی | صرافی رمزارز امن و حرفه‌ای",
  '"خرید بیت کوین"',
  '"خرید تتر"',
  '"صرافی رمزارز ایران"',
]) {
  if (rootLayout.includes(forbidden)) {
    failures.push(`unsupported root metadata claim remains: ${forbidden}`);
  }
}

const themeProvider = read("src/components/theme-provider.tsx");
requireText(
  themeProvider,
  "{...props}",
  "ThemeProvider must forward the CSP nonce to next-themes",
);

const landing = read("src/app/home/enterprise/TecpeyEnterpriseLanding.tsx");
for (const forbidden of ["۲۴/۷", ">Online</div>", "اولین معامله واقعی"]) {
  if (landing.includes(forbidden)) {
    failures.push(`unsupported public landing claim remains: ${forbidden}`);
  }
}
for (const required of [
  "نمایش آموزشی بازار",
  "ساعات اعلام‌شده",
  "فقط پس از فعال‌سازی و تأیید عملیاتی",
  '["نمای بازار", "آموزشی"]',
]) {
  requireText(landing, required, `truthful landing disclosure missing: ${required}`);
}

const englishLanding = read("src/app/en/EnglishLandingClient.tsx");
for (const required of [
  "Market learning board",
  "virtual Arena capital",
  "Arena attempts",
  "guided exercises",
  "Market access activation",
  "Live financial services remain gated",
]) {
  requireText(englishLanding, required, `truthful English landing disclosure missing: ${required}`);
}
for (const forbidden of [
  "Online market board",
  "Crypto trading platform",
  "Quizzes, XP, real scenarios",
]) {
  if (englishLanding.includes(forbidden)) {
    failures.push(`unsupported English landing claim remains: ${forbidden}`);
  }
}

const publicMentorSpotlight = read("src/components/home/TecpeyHomeAI.tsx");
for (const forbidden of ["24/7 learning", "آموزش ۲۴ ساعته", ">Online</span>"]) {
  if (publicMentorSpotlight.includes(forbidden)) {
    failures.push(`unsupported public Mentor claim remains: ${forbidden}`);
  }
}
for (const required of [
  "On-demand learning",
  "یادگیری هنگام نیاز",
  "Learning preview",
  "نمای آموزشی",
]) {
  requireText(
    publicMentorSpotlight,
    required,
    `truthful public Mentor disclosure missing: ${required}`,
  );
}

const navbar = read("src/components/navbar/Navbar.tsx");
for (const required of [
  'path: "/signin" | "/signup"',
  'authLink("/signin")',
  'authLink("/signup")',
]) {
  requireText(navbar, required, `canonical auth link boundary missing: ${required}`);
}
if (/authLink\(\s*["']https?:\/\//.test(navbar)) {
  failures.push("Navbar authLink must receive a relative /signin or /signup path");
}

const globalMentor = read("src/components/academy/GlobalAiMentorWidget.tsx");
requireText(
  globalMentor,
  "if (!academyChecked || !academyProfileReady) return null;",
  "personalized GlobalAiMentorWidget must remain hidden until canonical Academy profile readiness",
);

const publicMentor = read("src/components/academy/PublicMentorEntry.tsx");
for (const token of [
  "parseProfileStatusPayload",
  "if (!response.ok)",
  "Object.prototype.hasOwnProperty.call",
  'if (profileStatus !== "absent") return null;',
  "academy_profile_status_",
  'return "unavailable"',
]) {
  requireText(publicMentor, token, `public Mentor fail-closed boundary missing: ${token}`);
}

if (failures.length > 0) {
  console.error(`Browser Golden Path authority failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  "Browser Golden Path authority passed: production custom-server with isolated PostgreSQL/Redis, pinned Playwright, four browser/viewport projects, permanent all-PR/main workflow, canonical auth links, truthful metadata/copy, one fail-closed public Mentor entry, profile-ready personalized Mentor, and no temporary patch assets.",
);
