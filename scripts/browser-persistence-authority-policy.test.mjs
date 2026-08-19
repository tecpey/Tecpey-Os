import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { evaluateBrowserPersistence } from "./check-browser-persistence.mjs";

// The browser-persistence guard exists to enforce a launch No-Go rule: no
// launch-critical user state may depend on browser-only authority. It does that
// two ways, and this suite proves both are load-bearing rather than decorative:
//
//   1. A persisting production file must carry a classification drawn from a
//      fixed disposable set. A tag outside that set — anything that implies the
//      browser owns authority — is refused, so a file cannot legalise persistence
//      by simply declaring itself authoritative. (Before this, any non-empty
//      classification passed.)
//   2. document.cookie and window.name assignments are durable browser-authority
//      vectors and are counted as persistence, so they cannot slip past the
//      Storage/Cache detection. Reading a server-set cookie is not a write and is
//      not counted.

const tmpDirs = [];

function fixture(files) {
  const base = mkdtempSync(path.join(os.tmpdir(), "browser-persist-"));
  tmpDirs.push(base);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(base, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return base;
}

function evaluateFixture(base, policyEntries) {
  return evaluateBrowserPersistence({
    root: path.join(base, "src"),
    cwd: base,
    policy: new Map(Object.entries(policyEntries)),
    serverSurfaces: new Set(),
  });
}

after(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

test("passes on the real source tree", async () => {
  const { errors } = await evaluateBrowserPersistence();
  assert.deepEqual(errors, [], `real tree must satisfy the policy:\n${errors.join("\n")}`);
});

test("refuses a classification that implies browser-owned authority", async () => {
  const base = fixture({
    "src/app/ledger.ts": "localStorage.setItem('balance', String(x));\n",
  });

  const authoritative = await evaluateFixture(base, {
    "src/app/ledger.ts": { expected: 1, classification: "authoritative-account-ledger" },
  });
  assert.ok(
    authoritative.errors.some((e) => /may not be declared/.test(e)),
    `an authority-implying classification must be rejected; got:\n${authoritative.errors.join("\n")}`,
  );

  // Load-bearing check: the same file and count under a disposable tag raises no
  // classification error, so it is the classification driving the rejection.
  const disposable = await evaluateFixture(base, {
    "src/app/ledger.ts": { expected: 1, classification: "disposable-ui-cache" },
  });
  assert.deepEqual(
    disposable.errors,
    [],
    `a disposable classification must pass; got:\n${disposable.errors.join("\n")}`,
  );
});

test("refuses an empty classification", async () => {
  const base = fixture({
    "src/app/blank.ts": "sessionStorage.setItem('k', v);\n",
  });
  const { errors } = await evaluateFixture(base, {
    "src/app/blank.ts": { expected: 1, classification: "" },
  });
  assert.ok(
    errors.some((e) => /may not be declared/.test(e)),
    `an empty classification must be rejected; got:\n${errors.join("\n")}`,
  );
});

test("still refuses the retired quarantined-authority tag", async () => {
  const base = fixture({
    "src/lib/arena.ts": "indexedDB.open('trades');\n",
  });
  const { errors } = await evaluateFixture(base, {
    "src/lib/arena.ts": { expected: 1, classification: "quarantined-legacy-authority" },
  });
  assert.ok(
    errors.some((e) => /is retired/.test(e)),
    `the retired classification must be rejected; got:\n${errors.join("\n")}`,
  );
});

test("counts a document.cookie assignment as durable persistence", async () => {
  const base = fixture({
    "src/app/cookie-writer.ts": "document.cookie = 'session_authority=' + token;\n",
  });
  // No policy entry: the write must be discovered as unclassified persistence,
  // which only happens if the cookie-write vector is detected at all.
  const { errors } = await evaluateFixture(base, {});
  assert.ok(
    errors.some((e) => /cookie-writer\.ts: 1 unclassified/.test(e)),
    `a document.cookie assignment must be counted as persistence; got:\n${errors.join("\n")}`,
  );
});

test("counts a window.name assignment as durable persistence", async () => {
  const base = fixture({
    "src/app/name-writer.ts": "window.name = JSON.stringify(state);\n",
  });
  const { errors } = await evaluateFixture(base, {});
  assert.ok(
    errors.some((e) => /name-writer\.ts: 1 unclassified/.test(e)),
    `a window.name assignment must be counted as persistence; got:\n${errors.join("\n")}`,
  );
});

test("does not count reading a server-set cookie", async () => {
  const base = fixture({
    "src/app/cookie-reader.ts":
      "const raw = document.cookie;\nif (document.cookie === expected) accept();\n",
  });
  // Reading or comparing document.cookie is legitimate (the server set it); only
  // an assignment is a browser-authority write. The file must not be discovered
  // as persistence, so an empty policy yields no unclassified error for it.
  const { errors } = await evaluateFixture(base, {});
  assert.deepEqual(
    errors,
    [],
    `reading document.cookie must not count as persistence; got:\n${errors.join("\n")}`,
  );
});
