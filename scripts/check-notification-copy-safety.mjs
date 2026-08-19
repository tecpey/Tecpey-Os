import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Notification copy-safety guard.
//
// The product-completion / C-level governance doc
// (docs/engineering/governance/TECPEY_PRODUCT_COMPLETION_AND_C_LEVEL_GOVERNANCE.md)
// makes this a launch non-negotiable:
//
//   "Do not use notification hooks that promise profit, induce panic, or push
//    reckless trading behavior."
//
// That invariant was documented but unenforced: nothing stopped a future edit to
// the notification producers or the re-engagement "brain" from shipping FOMO,
// profit-promise, buy/sell-signal or gambling copy straight to users. This guard
// closes that gap by scanning the notification copy surface for forbidden
// patterns in the actual user-facing string/template literals.
//
// Scope is deliberately the notification engine plus the known external
// copy-emitters — NOT quiz/learning content (e.g. src/lib/learning-os.ts holds
// quiz *wrong-answer* options like "وعده سود قطعی" that users must learn to
// reject; those are legitimate educational content and must not be flagged).

const root = process.cwd();

// Whole notification engine (glob-discovered so new engine files are auto-covered)
const engineDir = path.join(root, "src", "lib", "notifications");

// Known external emitters of user-facing notification copy.
const externalCopyFiles = [
  "src/lib/phase5-achievement-engine.ts",
  "src/lib/security/security-notifications.ts",
];

// Wiring targets — the guard must stay invokable and enforced.
const wiringFiles = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
};

// Forbidden notification-copy patterns, grouped by the harm they cause. These
// are compiled from the single source of truth shared with the runtime
// enforcement (src/lib/notifications/copy-safety.ts), so the CI source scan and
// the creation-boundary check can never drift apart. Each RegExp is tested
// against the *contents* of copy string literals.
const patternsFile = path.join(root, "src", "lib", "notifications", "copy-safety-patterns.json");
const patternDoc = JSON.parse(await readFile(patternsFile, "utf8"));
const FORBIDDEN = patternDoc.rules.map((rule) => ({
  category: rule.category,
  reason: rule.reason,
  patterns: rule.patterns.map((source) => new RegExp(source, "i")),
}));

const failures = [];

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const details = await stat(absolute);
    if (details.isDirectory()) {
      output.push(...(await walk(absolute)));
    } else if (/\.(?:ts|tsx|js|mjs)$/.test(entry)) {
      output.push(absolute);
    }
  }
  return output;
}

// Extract the contents of JS string and template literals with their 1-based
// line numbers. Scanning literal contents (not raw source) keeps comments and
// identifiers out of scope — a doc comment naming a banned phrase never trips
// the guard, only real user-facing copy does.
function extractLiterals(source) {
  const literals = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    // Skip line comments
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    // Skip block comments
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const startLine = line;
      i += 1;
      let value = "";
      while (i < n) {
        const c = source[i];
        if (c === "\\") {
          value += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        if (c === "\n") line += 1;
        value += c;
        i += 1;
      }
      literals.push({ value, line: startLine });
      continue;
    }
    i += 1;
  }
  return literals;
}

async function scanFile(relative) {
  const absolute = path.join(root, relative);
  const source = await readFile(absolute, "utf8");
  for (const { value, line } of extractLiterals(source)) {
    for (const group of FORBIDDEN) {
      for (const pattern of group.patterns) {
        const match = value.match(pattern);
        if (match) {
          failures.push(
            `${relative}:${line}: ${group.category} — ${group.reason} (matched "${match[0]}")`,
          );
        }
      }
    }
  }
}

// 1. Scan the whole notification engine.
const engineFiles = (await walk(engineDir))
  .map((absolute) => path.relative(root, absolute))
  .filter((relative) => !relative.includes(`${path.sep}tests${path.sep}`));

for (const relative of engineFiles) {
  await scanFile(relative);
}

// 2. Scan the known external notification copy-emitters. Fail closed if one of
//    them has been moved/renamed so the copy surface can never silently escape.
for (const relative of externalCopyFiles) {
  try {
    await stat(path.join(root, relative));
  } catch {
    failures.push(
      `${relative}: expected notification copy-emitter is missing; update check-notification-copy-safety.mjs scope`,
    );
    continue;
  }
  await scanFile(relative);
}

// 3. Self-wiring: the guard is worthless if it is not enforced.
const wiring = Object.fromEntries(
  await Promise.all(
    Object.entries(wiringFiles).map(async ([key, file]) => [
      key,
      await readFile(path.join(root, file), "utf8"),
    ]),
  ),
);
const requireWiring = (target, text, reason) => {
  if (!wiring[target].includes(text)) failures.push(`${wiringFiles[target]}: ${reason}`);
};
requireWiring("package", '"notifications:copy-safety:check"', "copy-safety guard must be invokable through npm");
requireWiring("package", "npm run notifications:copy-safety:check", "release check must include notification copy safety");
requireWiring("ci", "Notification copy-safety guard", "pull-request CI must execute the notification copy-safety check");
requireWiring("ci", "npm run notifications:copy-safety:check", "CI copy-safety guard must use the governed npm command");

// 4. Runtime enforcement: the source scan cannot see copy assembled at runtime
//    from event payload fields, so the single governed creation boundary must
//    also fail unsafe copy closed. Require that wiring so it cannot be removed.
const creationSource = await readFile(
  path.join(root, "src", "lib", "notifications", "creation.ts"),
  "utf8",
);
if (!creationSource.includes("assertSafeNotificationCopy({ title: request.title, body: request.body })")) {
  failures.push(
    "src/lib/notifications/creation.ts: the governed creation boundary must call assertSafeNotificationCopy on title and body so runtime-assembled copy is also enforced",
  );
}
if (!creationSource.includes('from "./copy-safety"')) {
  failures.push(
    "src/lib/notifications/creation.ts: runtime copy-safety enforcement must be imported from the shared ./copy-safety module",
  );
}

if (failures.length) {
  console.error("Notification copy-safety check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Notification copy-safety check passed: ${engineFiles.length + externalCopyFiles.length} copy source files carry no profit-promise, FOMO/panic, trade-signal or gambling notification copy; the shared pattern source is enforced at the runtime creation boundary; and the guard is wired into CI and release governance.`,
);
