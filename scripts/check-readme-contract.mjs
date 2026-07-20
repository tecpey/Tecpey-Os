import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const readmePath = resolve(root, "README.md");
const packagePath = resolve(root, "package.json");
const readme = readFileSync(readmePath, "utf8");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const failures = [];

function repositoryPathFromLink(target) {
  const withoutFragment = target.split("#", 1)[0];
  const withoutQuery = withoutFragment.split("?", 1)[0];
  if (!withoutQuery) return null;
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(withoutQuery)) return null;
  return resolve(dirname(readmePath), decodeURIComponent(withoutQuery));
}

const markdownLinks = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
  (match) => match[1].trim(),
);
const htmlSources = [...readme.matchAll(/<(?:img|source)[^>]+(?:src|srcset)="([^"]+)"/gi)].map(
  (match) => match[1].trim(),
);

for (const target of [...markdownLinks, ...htmlSources]) {
  const localPath = repositoryPathFromLink(target);
  if (localPath && !existsSync(localPath)) {
    failures.push(`README link target does not exist: ${target}`);
  }
}

const referencedScripts = new Set();
for (const match of readme.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
  referencedScripts.add(match[1]);
}
for (const script of [...referencedScripts].sort()) {
  if (!packageJson.scripts?.[script]) {
    failures.push(`README references missing package script: npm run ${script}`);
  }
}

if (/\bnpm\s+test\b/.test(readme) && !packageJson.scripts?.test) {
  failures.push("README references npm test but package.json has no test script");
}

for (const requiredSection of [
  "## 1. Executive Overview",
  "## 3. Verified Engineering Reality",
  "## 4. Current P0 Critical Path",
  "## 6. Permanent Engineering Invariants",
  "## 7. Security, Privacy and Trust Posture",
  "## 9. Quality Engineering System",
  "## 13. Authoritative Documentation",
  "## 16. خلاصه مدیریتی فارسی",
]) {
  if (!readme.includes(requiredSection)) {
    failures.push(`README required section is missing: ${requiredSection}`);
  }
}

for (const requiredStatement of [
  "real-money exchange",
  "NO-GO",
  "Server-authoritative persistence",
  "Repository-wide line-by-line audit",
  "تک‌پی، نقطه امن ورود به بازار رمزارز",
]) {
  if (!readme.includes(requiredStatement)) {
    failures.push(`README required safety/identity statement is missing: ${requiredStatement}`);
  }
}

if (failures.length > 0) {
  console.error("README contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `README contract passed: ${markdownLinks.length} Markdown links, ` +
    `${htmlSources.length} HTML asset references and ${referencedScripts.size} npm scripts verified.`,
);
