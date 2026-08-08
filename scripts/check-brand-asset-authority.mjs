import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readBuffer(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(readBuffer(relativePath)).digest("hex");
}

function assertFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`${relativePath}: missing governed brand asset`);
    return false;
  }
  return true;
}

function pngDimensions(relativePath) {
  const source = readBuffer(relativePath);
  if (source.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    fail(`${relativePath}: expected PNG signature`);
    return null;
  }
  return {
    width: source.readUInt32BE(16),
    height: source.readUInt32BE(20),
  };
}

function assertPngDimensions(relativePath, expected) {
  const actual = pngDimensions(relativePath);
  if (!actual) return;
  const actualValue = `${actual.width}x${actual.height}`;
  if (actualValue !== expected) {
    fail(`${relativePath}: expected ${expected}, got ${actualValue}`);
  }
}

const registryPath = "docs/assets/brand/brand-assets.json";
const registry = readJson(registryPath);

if (registry.brand !== "TecPey" || registry.persianName !== "تک‌پی") {
  fail(`${registryPath}: brand identity must remain TecPey / تک‌پی`);
}

const canonical = registry.canonicalIcon ?? {};
if (canonical.path !== "public/images/tecpey-logo.png") {
  fail(`${registryPath}: canonical icon path must remain public/images/tecpey-logo.png`);
}
if (canonical.dimensions !== "512x512" || canonical.format !== "png" || canonical.transparent !== true) {
  fail(`${registryPath}: canonical icon metadata must describe a transparent 512x512 PNG`);
}

for (const required of [
  canonical.path,
  "docs/assets/brand/tecpey-logo-official.png",
  "docs/assets/brand/tecpey-logo-official.webp",
  "docs/assets/brand/generated/tecpey-logo-1024.png",
  "docs/assets/brand/generated/tecpey-lockup-fa-en.png",
  "docs/assets/brand/generated/tecpey-lockup-fa-en.webp",
]) {
  assertFile(required);
}

const canonicalHash = sha256(canonical.path);
if (canonical.sha256 !== canonicalHash) {
  fail(`${registryPath}: canonicalIcon.sha256 must match ${canonical.path}`);
}
if (sha256("docs/assets/brand/tecpey-logo-official.png") !== canonicalHash) {
  fail("docs/assets/brand/tecpey-logo-official.png must match the runtime canonical icon exactly");
}

assertPngDimensions(canonical.path, "512x512");
assertPngDimensions("docs/assets/brand/tecpey-logo-official.png", "512x512");
assertPngDimensions("docs/assets/brand/generated/tecpey-logo-1024.png", "1024x1024");
assertPngDimensions("docs/assets/brand/generated/tecpey-lockup-fa-en.png", "1200x548");

const runtimeIconSizes = new Map([
  ["public/favicon-16x16.png", "16x16"],
  ["public/favicon-32x32.png", "32x32"],
  ["public/favicon-48x48.png", "48x48"],
  ["public/apple-touch-icon.png", "180x180"],
  ["public/android-chrome-192x192.png", "192x192"],
  ["public/android-chrome-512x512.png", "512x512"],
]);

for (const [runtimeIcon, size] of runtimeIconSizes) {
  assertFile(runtimeIcon);
  assertPngDimensions(runtimeIcon, size);
}

for (const runtimeIcon of runtimeIconSizes.keys()) {
  if (!registry.runtimeIcons?.includes(runtimeIcon)) {
    fail(`${registryPath}: runtimeIcons must include ${runtimeIcon}`);
  }
}

const webManifest = readJson("public/site.webmanifest");
const manifestIconSources = new Set((webManifest.icons ?? []).map((icon) => icon.src));
for (const runtimeIcon of runtimeIconSizes.keys()) {
  const webPath = `/${runtimeIcon.replace(/^public\//, "")}`;
  if (!manifestIconSources.has(webPath)) {
    fail(`public/site.webmanifest: icons must include ${webPath}`);
  }
}

const sourceReferences = registry.sourceReferences ?? [];
const sourceReferenceHashes = registry.sourceReferenceHashes ?? {};
for (const sourceReference of sourceReferences) {
  if (!assertFile(sourceReference)) continue;
  const expectedHash = sourceReferenceHashes[sourceReference];
  if (!expectedHash) {
    fail(`${registryPath}: sourceReferenceHashes must include ${sourceReference}`);
    continue;
  }
  if (sha256(sourceReference) !== expectedHash) {
    fail(`${sourceReference}: source reference hash drifted from the approved upload`);
  }
}

for (const sourceReference of Object.keys(sourceReferenceHashes)) {
  if (!sourceReferences.includes(sourceReference)) {
    fail(`${registryPath}: sourceReferenceHashes contains unlisted source ${sourceReference}`);
  }
}

const readme = readText("README.md");
if (!readme.includes("./docs/assets/brand/tecpey-logo-official.webp")) {
  fail("README.md: header must render the governed official logo preview");
}

const branding = readText("docs/Branding.md");
for (const expectedText of [
  "Favicon, Apple touch icon, Android/PWA icons and README previews must be generated from the same official icon source.",
  "/docs/assets/brand/generated/tecpey-lockup-fa-en.png",
]) {
  if (!branding.includes(expectedText)) {
    fail(`docs/Branding.md: missing brand policy text: ${expectedText}`);
  }
}

const seo = readText("src/lib/seo.ts");
const layout = readText("src/app/layout.tsx");
const markComponent = readText("src/components/brand/TecpeyMark.tsx");
for (const [relativePath, source] of [
  ["src/lib/seo.ts", seo],
  ["src/app/layout.tsx", layout],
  ["src/components/brand/TecpeyMark.tsx", markComponent],
]) {
  if (!source.includes("/images/tecpey-logo.png")) {
    fail(`${relativePath}: must use the canonical runtime logo`);
  }
}

if (failures.length > 0) {
  console.error("TecPey brand asset authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("TecPey brand asset authority check passed: official TP sources, runtime icons, metadata and README preview are governed.");
