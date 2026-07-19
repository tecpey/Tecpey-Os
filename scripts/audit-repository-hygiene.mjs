import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

const ROOT = process.cwd();
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "dist",
  "build",
  ".turbo",
  ".cache",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const RESOLUTION_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const ENTRYPOINT_BASENAMES = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "layout.ts",
  "route.ts",
  "route.tsx",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "template.tsx",
  "default.tsx",
]);
const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const IMPORT_PATTERNS = [
  /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
  /require\(\s*["']([^"']+)["']\s*\)/g,
];

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function externalPackageRoot(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
    return null;
  }
  if (BUILTINS.has(specifier)) return null;
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function importSpecifiers(filePath) {
  const text = readText(filePath);
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) found.add(match[1]);
  }
  return [...found];
}

function resolveLocalImport(fromFile, specifier, allFileSet) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const candidates = [];
  for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of RESOLUTION_EXTENSIONS.slice(1)) candidates.push(path.join(base, `index${extension}`));
  return candidates.find((candidate) => allFileSet.has(candidate)) ?? null;
}

function isEntrypoint(filePath) {
  const rel = relative(filePath);
  const base = path.basename(filePath);
  if (ENTRYPOINT_BASENAMES.has(base) && rel.startsWith("src/app/")) return true;
  if (rel === "server.ts" || rel === "middleware.ts" || rel === "src/middleware.ts") return true;
  if (rel.startsWith("scripts/") || rel.startsWith("src/tests/")) return true;
  if (/^(next|postcss|eslint|tailwind|instrumentation)\.config\./.test(base)) return true;
  return false;
}

function reachableSourceFiles(sourceFiles, allFileSet) {
  const graph = new Map();
  for (const filePath of sourceFiles) {
    const dependencies = importSpecifiers(filePath)
      .map((specifier) => resolveLocalImport(filePath, specifier, allFileSet))
      .filter(Boolean);
    graph.set(filePath, dependencies);
  }

  const queue = sourceFiles.filter(isEntrypoint);
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    for (const dependency of graph.get(current) ?? []) {
      if (visited.has(dependency)) continue;
      visited.add(dependency);
      queue.push(dependency);
    }
  }
  return visited;
}

function suspiciousArtifactReason(rel) {
  const base = path.basename(rel);
  if (/\.(?:bak|backup|old|orig|rej|tmp|temp|swp|swo)$/i.test(base)) return "backup-or-editor-artifact";
  if (/~$/.test(base)) return "editor-backup";
  if (/(?:^|[-_. ])(?:copy|duplicate|backup)(?:[-_. ]|\d|$)/i.test(base)) return "copy-or-duplicate-name";
  if (/(?:^|\/)(?:tmp|temp|backups?|archives?)(?:\/|$)/i.test(rel)) return "temporary-or-archive-directory";
  return null;
}

function sourceMarkerCounts(sourceFiles) {
  const markers = {
    localStorage: 0,
    sessionStorage: 0,
    indexedDb: 0,
    todo: 0,
    fixme: 0,
    hack: 0,
    legacy: 0,
  };
  for (const filePath of sourceFiles) {
    const text = readText(filePath);
    markers.localStorage += (text.match(/\blocalStorage\b/g) ?? []).length;
    markers.sessionStorage += (text.match(/\bsessionStorage\b/g) ?? []).length;
    markers.indexedDb += (text.match(/\bIndexedDB\b|\bindexedDB\b/g) ?? []).length;
    markers.todo += (text.match(/\bTODO\b/g) ?? []).length;
    markers.fixme += (text.match(/\bFIXME\b/g) ?? []).length;
    markers.hack += (text.match(/\bHACK\b/g) ?? []).length;
    markers.legacy += (text.match(/\blegacy\b/gi) ?? []).length;
  }
  return markers;
}

function duplicateBasenames(files) {
  const map = new Map();
  for (const filePath of files) {
    const base = path.basename(filePath).toLowerCase();
    if (["index.ts", "index.tsx", "route.ts", "page.tsx", "layout.tsx"].includes(base)) continue;
    const values = map.get(base) ?? [];
    values.push(relative(filePath));
    map.set(base, values);
  }
  return [...map.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([basename, values]) => ({ basename, files: values.sort() }))
    .sort((left, right) => right.files.length - left.files.length || left.basename.localeCompare(right.basename));
}

const allFiles = walk(ROOT);
const allFileSet = new Set(allFiles);
const sourceFiles = allFiles.filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)));
const packageJson = JSON.parse(readText(path.join(ROOT, "package.json")) || "{}");
const declaredDependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};
const usage = new Map(Object.keys(declaredDependencies).map((name) => [name, new Set()]));

for (const filePath of sourceFiles) {
  for (const specifier of importSpecifiers(filePath)) {
    const packageName = externalPackageRoot(specifier);
    if (packageName && usage.has(packageName)) usage.get(packageName).add(relative(filePath));
  }
}

const scriptText = JSON.stringify(packageJson.scripts ?? {});
for (const packageName of Object.keys(declaredDependencies)) {
  const executable = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
  if (scriptText.includes(packageName) || (executable && scriptText.includes(executable))) {
    usage.get(packageName).add("package.json#scripts");
  }
}

const reachable = reachableSourceFiles(sourceFiles, allFileSet);
const orphanCandidates = sourceFiles
  .filter((filePath) => filePath.startsWith(path.join(ROOT, "src")))
  .filter((filePath) => !reachable.has(filePath))
  .filter((filePath) => !filePath.endsWith(".d.ts"))
  .map(relative)
  .sort();
const suspiciousArtifacts = allFiles
  .map((filePath) => ({ file: relative(filePath), reason: suspiciousArtifactReason(relative(filePath)) }))
  .filter((item) => item.reason)
  .sort((left, right) => left.file.localeCompare(right.file));
const zeroByteFiles = allFiles
  .filter((filePath) => fs.statSync(filePath).size === 0)
  .map(relative)
  .sort();
const largeFiles = allFiles
  .map((filePath) => ({ file: relative(filePath), bytes: fs.statSync(filePath).size }))
  .filter((item) => item.bytes >= 250_000)
  .sort((left, right) => right.bytes - left.bytes);
const dependencyUsage = [...usage.entries()]
  .map(([name, files]) => ({ name, references: files.size, files: [...files].sort() }))
  .sort((left, right) => left.references - right.references || left.name.localeCompare(right.name));
const unreferencedDependencies = dependencyUsage.filter((item) => item.references === 0);

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    files: allFiles.length,
    sourceFiles: sourceFiles.length,
    entrypoints: sourceFiles.filter(isEntrypoint).length,
  },
  warning: "Candidates are not deletion approval. Dynamic imports, framework conventions, generated consumers and operational usage require manual verification.",
  suspiciousArtifacts,
  zeroByteFiles,
  largeFiles,
  unreferencedDependencies,
  orphanCandidates,
  duplicateBasenames: duplicateBasenames(sourceFiles),
  sourceMarkers: sourceMarkerCounts(sourceFiles),
  dependencyUsage,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Repository Hygiene Inventory");
  console.log(`Files scanned: ${report.scope.files}`);
  console.log(`Source files: ${report.scope.sourceFiles}`);
  console.log(`Entrypoints: ${report.scope.entrypoints}`);
  console.log(`Suspicious artifacts: ${suspiciousArtifacts.length}`);
  console.log(`Zero-byte files: ${zeroByteFiles.length}`);
  console.log(`Large files (>=250KB): ${largeFiles.length}`);
  console.log(`Declared dependencies without detected direct usage: ${unreferencedDependencies.length}`);
  console.log(`Unreachable source candidates: ${orphanCandidates.length}`);
  console.log(`Duplicate non-framework basenames: ${report.duplicateBasenames.length}`);
  console.log(`Source markers: ${JSON.stringify(report.sourceMarkers)}`);

  if (suspiciousArtifacts.length) {
    console.log("\nSuspicious artifact candidates:");
    for (const item of suspiciousArtifacts) console.log(`- ${item.file} (${item.reason})`);
  }
  if (unreferencedDependencies.length) {
    console.log("\nDependencies requiring manual ownership review:");
    for (const item of unreferencedDependencies) console.log(`- ${item.name}`);
  }
  if (orphanCandidates.length) {
    console.log("\nUnreachable source candidates (manual review required):");
    for (const file of orphanCandidates.slice(0, 80)) console.log(`- ${file}`);
    if (orphanCandidates.length > 80) console.log(`- ... ${orphanCandidates.length - 80} more`);
  }
}
