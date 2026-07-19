import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  issueOfflineSyncScope,
  verifyOfflineSyncScope,
} from "../../lib/offline-sync-scope";

const TEST_SECRET = "offline-scope-test-secret-with-at-least-32-characters";

async function withOfflineSecret<T>(callback: () => T | Promise<T>): Promise<T> {
  const previous = process.env.TECPEY_OFFLINE_SYNC_SECRET;
  process.env.TECPEY_OFFLINE_SYNC_SECRET = TEST_SECRET;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.TECPEY_OFFLINE_SYNC_SECRET;
    else process.env.TECPEY_OFFLINE_SYNC_SECRET = previous;
  }
}

describe("Offline principal scope authority", () => {
  it("verifies the exact signed tenant and student scope", async () => {
    await withOfflineSecret(() => {
      const now = Date.parse("2026-07-19T12:00:00.000Z");
      const issued = issueOfflineSyncScope({
        tenantId: "tenant-a",
        studentId: "00000000-0000-4000-8000-000000000001",
        now,
      });
      assert.ok(issued);

      const verified = verifyOfflineSyncScope(issued!.token, now + 1_000);
      assert.equal(verified.status, "valid");
      if (verified.status === "valid") {
        assert.equal(verified.scope.tenantId, "tenant-a");
        assert.equal(
          verified.scope.studentId,
          "00000000-0000-4000-8000-000000000001",
        );
        assert.equal(verified.scope.issuedAt, now);
        assert.equal(
          new Date(verified.scope.expiresAt).toISOString(),
          issued!.expiresAt,
        );
      }
    });
  });

  it("rejects tampering and cross-principal substitution", async () => {
    await withOfflineSecret(async () => {
      const issued = issueOfflineSyncScope({
        tenantId: "tenant-a",
        studentId: "00000000-0000-4000-8000-000000000001",
      });
      assert.ok(issued);
      const [payload, signature] = issued!.token.split(".");
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      decoded.studentId = "00000000-0000-4000-8000-000000000002";
      const substituted = `${Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url")}.${signature}`;
      assert.deepEqual(verifyOfflineSyncScope(substituted), { status: "invalid" });

      const route = await readFile("src/app/api/offline-sync/route.ts", "utf8");
      assert.match(route, /scope\.scope\.tenantId !== platform\.tenantId/);
      assert.match(route, /scope\.scope\.studentId !== session\.studentId/);
      assert.match(route, /reason: "principal_scope_mismatch"/);
    });
  });

  it("rejects expired principal scope", async () => {
    await withOfflineSecret(() => {
      const issuedAt = Date.parse("2026-01-01T00:00:00.000Z");
      const issued = issueOfflineSyncScope({
        tenantId: "tenant-a",
        studentId: "00000000-0000-4000-8000-000000000001",
        now: issuedAt,
      });
      assert.ok(issued);
      assert.deepEqual(
        verifyOfflineSyncScope(issued!.token, Date.parse("2026-05-01T00:00:00.000Z")),
        { status: "expired" },
      );
    });
  });

  it("does not acknowledge mismatched principal commands", async () => {
    const route = await readFile("src/app/api/offline-sync/route.ts", "utf8");
    const mismatchIndex = route.indexOf('reason: "principal_scope_mismatch"');
    const processIndex = route.indexOf("processOfflineSyncCommand({");
    assert.ok(mismatchIndex >= 0);
    assert.ok(processIndex > mismatchIndex);
    assert.match(
      route.slice(mismatchIndex - 250, mismatchIndex + 250),
      /status: "retryable"/,
    );
  });

  it("quarantines legacy unscoped commands instead of assigning or deleting them", async () => {
    const client = await readFile(
      "src/components/offline/OfflineSyncManager.tsx",
      "utf8",
    );
    const adapterIndex = client.indexOf("function transportStorage()");
    const readLegacyIndex = client.indexOf("store.getItem(LEGACY_STORAGE_KEY)");
    const quarantineIndex = client.indexOf(
      "store.setItem(LEGACY_QUARANTINE_KEY, legacy)",
    );
    const removeIndex = client.indexOf("store.removeItem(LEGACY_STORAGE_KEY)");
    assert.ok(adapterIndex >= 0);
    assert.ok(readLegacyIndex > adapterIndex);
    assert.ok(quarantineIndex > readLegacyIndex);
    assert.ok(removeIndex > quarantineIndex);
    assert.equal(client.includes("writeQueue([...readQueue(), ...legacy"), false);
    const storageApiToken = "local" + "Storage";
    assert.equal(
      client.split(/\r?\n/).filter((line) => line.includes(storageApiToken)).length,
      1,
    );
  });
});
