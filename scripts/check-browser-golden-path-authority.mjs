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
  "IntersectionObserver",
  "مرکز دانش",
  "Knowledge Center",
  "تریدینگ آرنا",
  "Trading Arena",
  "از مربی آموزشی تک‌پی بپرس",
  "Ask TecPey learning mentor",
  "scrollWidth",
  'localStorage.getItem("theme")',
  "expectCanonicalAuthLinks",
  "tecpey.irhttps://",
  "24\\/7|۲۴\\/۷|۲۴ ساعته",
]) {
  requireText(spec, token, `browser Golden Path coverage missing ${token}`);
}

const workflow = read(".github/workflows/browser-golden-path.yml");
for (const token of [
  "push:",
  "pull_request:",
  "image: redis:7-alpine",
  'redis-cli ping',
  "npm ci",
  "npm run browser:check",
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
]) {
  requireText(rootLayout, token, `server locale/CSP nonce boundary missing: ${token}`);
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
]) {
  requireText(landing, required, `truthful landing disclosure missing: ${required}`);
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

const mentor = read("src/components/academy/GlobalAiMentorWidget.tsx");
if (mentor.includes("if (!academyChecked || !academyProfileReady) return null;")) {
  failures.push("public mentor entry is still hidden for users without an Academy profile");
}
for (const token of [
  "if (!academyChecked) return null;",
  "منتور بعد از ساخت پروفایل آکادمی فعال می‌شود",
  "Mentor activates after academy profile",
]) {
  requireText(mentor, token, `public locked Mentor boundary missing: ${token}`);
}

if (failures.length > 0) {
  console.error(`Browser Golden Path authority failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  "Browser Golden Path authority passed: production custom-server plus isolated Redis, pinned Playwright, four browser/viewport projects, permanent all-PR/main workflow, canonical auth links, truthful public claims, public locked Mentor, and no temporary patch assets.",
);
