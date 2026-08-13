import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

// verifyCsrfOrigin became async when it gained the verified-tenant-domain
// allowance, and a forgotten `await` disables CSRF on that route **silently**:
//
//   if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
//
// A Promise is always truthy, so `!promise` is always false and the guard never
// fires. Nothing else catches this. TypeScript accepts `!` on a Promise — I
// verified that by deleting one `await` and running `tsc --noEmit`, which
// reported no error — and the repo has no type-aware lint rule
// (`no-misused-promises` needs type information that this ESLint config does not
// build). Every mutating route in the app depends on this call, so the failure
// would be both total and invisible.
//
// Hence a source guard, swept across the tree rather than a fixed list.

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFINITION = "src/lib/csrf.ts";

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

describe("CSRF await guard", () => {
  it("awaits verifyCsrfOrigin at every call site", async () => {
    const offenders: string[] = [];
    let callSites = 0;

    for (const dir of ["src/app", "src/lib"]) {
      for (const file of await sourceFiles(path.join(ROOT, dir))) {
        const relative = path.relative(ROOT, file);
        if (relative === DEFINITION) continue;
        const source = await readFile(file, "utf8");

        for (const match of source.matchAll(/(\w+\s+)?verifyCsrfOrigin\s*\(/g)) {
          // The import statement has no call parentheses, so anything matching
          // here is a call.
          callSites += 1;
          const preceding = match[1]?.trim();
          if (preceding !== "await") {
            const line = source.slice(0, match.index).split("\n").length;
            offenders.push(`${relative}:${line}`);
          }
        }
      }
    }

    assert.ok(callSites >= 60, `expected the sweep to find call sites, saw ${callSites}`);
    assert.deepEqual(
      offenders,
      [],
      "these call sites evaluate a Promise as a boolean, so CSRF never blocks there",
    );
  });

  it("keeps verifyCsrfOrigin async, so the guard above stays meaningful", async () => {
    const definition = await readFile(path.join(ROOT, DEFINITION), "utf8");
    assert.match(
      definition,
      /export async function verifyCsrfOrigin\(/,
      "if this became synchronous again the await sweep would be checking nothing",
    );
  });
});
