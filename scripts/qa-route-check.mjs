import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, callback);
    else callback(fullPath);
  }
}

function routeSegments(route) {
  return route === "/" ? [] : route.slice(1).split("/");
}

function pageRoute(appDirectory, pageFile) {
  const rawSegments = path
    .relative(appDirectory, path.dirname(pageFile))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.+\)$/.test(segment))
    .filter((segment) => !segment.startsWith("@"));
  return rawSegments.length === 0 ? "/" : `/${rawSegments.join("/")}`;
}

function pageMatchesRoute(page, route) {
  const pattern = routeSegments(page);
  const actual = routeSegments(route);
  let patternIndex = 0;
  let actualIndex = 0;
  while (patternIndex < pattern.length) {
    const segment = pattern[patternIndex];
    if (/^\[\[\.\.\.[^/]+\]\]$/.test(segment)) {
      return patternIndex === pattern.length - 1;
    }
    if (/^\[\.\.\.[^/]+\]$/.test(segment)) {
      return patternIndex === pattern.length - 1 && actualIndex < actual.length;
    }
    if (actualIndex >= actual.length) return false;
    if (!/^\[[^/]+\]$/.test(segment) && segment !== actual[actualIndex]) {
      return false;
    }
    patternIndex += 1;
    actualIndex += 1;
  }
  return actualIndex === actual.length;
}

function isTestSource(file) {
  return (
    file.split(path.sep).includes("tests") ||
    /\.(?:test|spec)\.(?:tsx?|mts)$/.test(file)
  );
}

export function collectRouteQa(root = process.cwd()) {
  const appDirectory = path.join(root, "src/app");
  const pages = new Set();
  walk(appDirectory, (file) => {
    if (path.basename(file) === "page.tsx") {
      pages.add(pageRoute(appDirectory, file));
    }
  });

  const missing = [];
  walk(path.join(root, "src"), (file) => {
    if (!/\.(?:tsx|ts)$/.test(file) || isTestSource(file)) return;
    const source = fs.readFileSync(file, "utf8");
    const links = source.matchAll(
      /\bhref\s*(?:=|:)\s*\{?\s*["']([^"'#$]+)(?:[?#][^"']*)?["']/g,
    );
    for (const match of links) {
      const href = match[1];
      if (!href.startsWith("/") || href.startsWith("//") || href.includes("[")) {
        continue;
      }
      const route = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      if (![...pages].some((page) => pageMatchesRoute(page, route))) {
        missing.push({
          href,
          file: path.relative(root, file).replaceAll(path.sep, "/"),
        });
      }
    }
  });

  return {
    pages: [...pages].sort(),
    missing: missing.sort(
      (left, right) =>
        left.file.localeCompare(right.file) || left.href.localeCompare(right.href),
    ),
  };
}

function main() {
  const result = collectRouteQa();
  if (result.missing.length > 0) {
    console.error("Missing internal routes:");
    for (const item of result.missing) {
      console.error(`- ${item.href} -> ${item.file}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Route QA passed. ${result.pages.length} pages indexed.`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
