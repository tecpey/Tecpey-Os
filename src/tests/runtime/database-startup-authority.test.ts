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

  it("has no repository-owned production start script that bypasses the custom server", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (/^(?:start|prod:)/.test(name)) {
        assert.doesNotMatch(command, /\bnext\s+start\b/, `${name} bypasses production readiness`);
      }
    }
    assert.match(packageJson.scripts.start, /server\.ts/);

    const deploymentPaths = await Promise.all([
      readFile("Dockerfile", "utf8"),
      readFile("docker-compose.production.yml", "utf8"),
      readFile("deploy/systemd/tecpey-web.service", "utf8"),
      readFile("ecosystem.config.cjs", "utf8"),
    ]);
    assert.match(deploymentPaths[0], /CMD \["npm", "run", "start"\]/);
    assert.doesNotMatch(deploymentPaths.join("\n"), /\bnext\s+start\b/);
  });

  it("governs migration command cleanup and signal interruption without forced test exit", async () => {
    const command = await readFile("scripts/run-database-migrations.ts", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    assert.match(command, /\["SIGINT", "SIGTERM"\]/);
    assert.match(command, /process\.once\(signal/);
    assert.match(command, /interruption\.abort\(\)/);
    assert.match(command, /client\?\.release\(\)/);
    assert.match(command, /await pool\.end\(\)/);
    assert.doesNotMatch(packageJson, /test:migrations[^\n]*--test-force-exit/);
    assert.doesNotMatch(packageJson, /test:readiness[^\n]*--test-force-exit/);
    assert.doesNotMatch(packageJson, /test:startup[^\n]*--test-force-exit/);
  });
});
