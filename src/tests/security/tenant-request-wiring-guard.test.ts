import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

// Every tenant-scoped route must hand its request to tenant resolution.
//
// The Host header is the only thing that names a white-label tenant, and a call
// site that omits `request` silently resolves to the principal's default-ranked
// binding instead. That failure is invisible: the route still works, still
// returns data, and still passes every behavioural test — it just serves the
// wrong tenant's data on a branded domain. Nothing but a source guard catches an
// omitted argument at a call site that was never written.
//
// This is a whole-tree sweep rather than a fixed list, so a NEW tenant-scoped
// route is covered the moment it is added.

const ROOT = path.resolve(import.meta.dirname, "../../..");
const API_ROOT = path.join(ROOT, "src/app/api");

async function routeFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await routeFiles(full)));
    else if (entry.name === "route.ts") found.push(full);
  }
  return found;
}

describe("Tenant request wiring", () => {
  it("passes the request at every resolveTenantPrincipalContext call site", async () => {
    const offenders: string[] = [];
    let callSites = 0;

    for (const file of await routeFiles(API_ROOT)) {
      const source = await readFile(file, "utf8");
      if (!source.includes("resolveTenantPrincipalContext({")) continue;

      // Each call's argument object, up to its closing `});`.
      const calls = source.split("resolveTenantPrincipalContext({").slice(1);
      for (const rest of calls) {
        callSites += 1;
        const args = rest.slice(0, rest.indexOf("});"));
        const wired =
          /\brequest:\s*(req|request)\b/.test(args) ||
          /\bassertedTenantId:/.test(args);
        if (!wired) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    assert.ok(callSites >= 30, `expected the sweep to find call sites, saw ${callSites}`);
    assert.deepEqual(
      offenders,
      [],
      "these routes resolve a tenant without their request, so a white-label host cannot reach them",
    );
  });
});
