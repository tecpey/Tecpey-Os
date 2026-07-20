import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationPath =
  "src/lib/db-migrate-exchange-order-final-evidence-gate.ts";

describe("Exchange final command source authority", () => {
  it("permanently rejects post-final state and result rewrites", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const invariant of [
      "IF OLD.state = 'final' THEN",
      "NEW.state IS DISTINCT FROM OLD.state",
      "NEW.result IS DISTINCT FROM OLD.result",
      "exchange order final command outcome is immutable",
      "BEFORE UPDATE OF state, result ON exchange_order_commands",
    ]) {
      assert.equal(
        migration.includes(invariant),
        true,
        `missing final-command immutability invariant: ${invariant}`,
      );
    }

    assert.equal(
      migration.includes(
        "IF NEW.state IS DISTINCT FROM 'final' OR OLD.state = 'final' THEN",
      ),
      false,
      "final rows must not bypass the immutability branch",
    );
  });
});
