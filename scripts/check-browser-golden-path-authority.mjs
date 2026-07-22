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
  "scripts/apply-browser-golden-path-patch.py",
  "scripts/apply-browser-runtime-fixes.py",
  "scripts/apply-browser-functional-fixes.py",
]) {
  if (existsSync(path)) failures.push(`temporary browser patch asset must not enter main: ${path}`);
}

const config = read("playwright.config.ts");
for (const token of [
  "chromium-desktop",
  "firefox-desktop",
  "chromium-mobile",
  "firefox-mobile",
  "npm run build && npm run start",
  'NODE_ENV: "production"',
  "retain-on-failure",
  "only-on-failure",
]) {
  requireText(config, token, `Playwright configuration missing ${token}`);
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
  "npm ci",
  "npm run browser:check",
  "playwright install --with-deps chromium firefox",
  "npm run test:browser",
  "if: failure()",
  "retention-days: 3",
]) {
  requireText(workflow, token, `browser workflow missing ${token}`);
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
if (navbar.includes('authLink("https://my.tecpey.ir/')) {
  failures.push("Navbar still passes an absolute URL into the app-origin auth link builder");
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
  "Browser Golden Path authority passed: production custom-server execution, pinned Playwright, four browser/viewport projects, canonical auth links, truthful public claims, public locked Mentor, and permanent CI evidence.",
);
