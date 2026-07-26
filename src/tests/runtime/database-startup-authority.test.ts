import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("production database startup authority", () => {
  it("verifies schema before Next prepares or the HTTP server listens", async () => {
    const server = await readFile("server.ts", "utf8");
    const verify = server.indexOf("await assertDatabaseReadyForRuntime()");
    const prepare = server.indexOf("await app.prepare()");
    const listen = server.indexOf("await listen()");
    assert.ok(verify >= 0 && verify < prepare && prepare < listen);
  });

  it("keeps application database access verify-only", async () => {
    const database = await readFile("src/lib/db.ts", "utf8");
    assert.doesNotMatch(database, /applyDatabaseMigrations/);
    assert.match(database, /checkMigrationReadiness\(client\)/);
    assert.match(database, /assertMigrationReady/);
  });

  it("makes schema state a fail-closed health dependency", async () => {
    const health = await readFile("src/app/api/health/route.ts", "utf8");
    const databaseHealth = await readFile("src/app/api/health/database/route.ts", "utf8");
    assert.match(health, /db\.schema\?\.status !== "current"/);
    assert.match(health, /database_schema_not_ready/);
    assert.match(health, /criticalDependencyFailure/);
    assert.match(databaseHealth, /schemaStatus !== "current"/);
    assert.match(databaseHealth, /database_not_ready/);
  });
});
