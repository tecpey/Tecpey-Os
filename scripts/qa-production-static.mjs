import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectRouteQa } from "./qa-route-check.mjs";

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, callback);
    else callback(fullPath);
  }
}

function sourceCommit(root) {
  const configured = process.env.TECPEY_EVIDENCE_SHA?.trim();
  if (configured && /^[0-9a-f]{40}$/.test(configured)) return configured;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function isTestSource(file) {
  return (
    file.split(path.sep).includes("tests") ||
    /\.(?:test|spec)\.(?:tsx?|mts)$/.test(file)
  );
}

export function collectProductionStaticReport(
  root = process.cwd(),
  checkedAt = new Date().toISOString(),
) {
  const routeQa = collectRouteQa(root);
  const issues = routeQa.missing.map(({ file, href }) => ({
    type: "missing-internal-route",
    file,
    value: href,
  }));

  walk(path.join(root, "src"), (file) => {
    if (!/\.(?:tsx|ts)$/.test(file) || isTestSource(file)) return;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:src|image)\s*[:=]\s*\{?\s*["'](\/[^"']+)["']/g,
    )) {
      const asset = match[1].split("?")[0];
      if (
        /^\/(?:images|assets|favicon|site\.webmanifest)/.test(asset) &&
        !fs.existsSync(path.join(root, "public", asset))
      ) {
        issues.push({
          type: "missing-public-asset",
          file: path.relative(root, file).replaceAll(path.sep, "/"),
          value: asset,
        });
      }
    }
    if (
      file.includes(`${path.sep}src${path.sep}app${path.sep}en${path.sep}`) &&
      /[\u0600-\u06FF]/.test(source)
    ) {
      issues.push({
        type: "persian-text-inside-en-route",
        file: path.relative(root, file).replaceAll(path.sep, "/"),
      });
    }
    if (/lorem ipsum/i.test(source)) {
      issues.push({
        type: "placeholder-copy",
        file: path.relative(root, file).replaceAll(path.sep, "/"),
      });
    }
  });

  for (const required of [
    "public/site.webmanifest",
    "public/images/tecpey-logo.png",
  ]) {
    if (!fs.existsSync(path.join(root, required))) {
      issues.push({ type: "missing-required-file", file: required });
    }
  }

  const sitemapFile = path.join(root, "src/app/sitemap.ts");
  if (!fs.existsSync(path.join(root, "src/app/robots.ts"))) {
    issues.push({ type: "missing-dynamic-robots", file: "src/app/robots.ts" });
  }
  let sitemapUrls = [];
  if (!fs.existsSync(sitemapFile)) {
    issues.push({ type: "missing-dynamic-sitemap", file: "src/app/sitemap.ts" });
  } else {
    const sitemapSource = fs.readFileSync(sitemapFile, "utf8");
    const literalPaths = [
      ...sitemapSource.matchAll(/"(\/?[a-z0-9][a-z0-9/-]*)"/gi),
    ]
      .map((match) => match[1])
      .filter((item) => item === "" || item.startsWith("/"));
    const dynamicSignals = [...sitemapSource.matchAll(/\.map\(\(/g)].length;
    sitemapUrls = [...new Set(literalPaths)];
    if (sitemapUrls.length + dynamicSignals < 25) {
      issues.push({
        type: "thin-sitemap",
        file: "src/app/sitemap.ts",
        value: String(sitemapUrls.length),
      });
    }
  }

  return {
    status: issues.length > 0 ? "failed" : "passed",
    sourceCommitSha: sourceCommit(root),
    checkedAt,
    pagesIndexed: routeQa.pages.length,
    sitemapUrls: sitemapUrls.length,
    issues,
  };
}

function main() {
  const root = process.cwd();
  const report = collectProductionStaticReport(root);
  const output = path.join(
    root,
    "artifacts/qa/production-static-report.json",
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.issues.length > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Static production QA passed: ${report.pagesIndexed} routes, ${report.sitemapUrls} sitemap URLs, 0 issues.`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
