import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Offline browser transport capacity", () => {
  it("does not truncate uncommitted commands when queue capacity is reached", async () => {
    const source = await readFile(
      "src/components/offline/OfflineSyncManager.tsx",
      "utf8",
    );
    assert.match(source, /const MAX_QUEUE_ITEMS = 200/);
    assert.match(
      source,
      /function writeQueue\(items: OfflineQueueItem\[\]\): boolean/,
    );
    assert.match(source, /items\.length > MAX_QUEUE_ITEMS/);
    assert.match(source, /JSON\.stringify\(items\)/);
    assert.equal(source.includes("slice(-200)"), false);
    assert.equal(source.includes("slice(0, 200)"), false);
  });

  it("surfaces quota or overflow failure instead of reporting the event as stored", async () => {
    const source = await readFile(
      "src/components/offline/OfflineSyncManager.tsx",
      "utf8",
    );
    const writeIndex = source.indexOf("function writeQueue(");
    const failureEventIndex = source.indexOf("tecpey-offline-queue-write-failed");
    const visibleStateIndex = source.indexOf("setQueueWriteFailed(true)");
    const visibleMessageIndex = source.indexOf(
      "حافظه آفلاین پر یا غیرقابل‌دسترسی است",
    );
    assert.ok(writeIndex >= 0);
    assert.ok(failureEventIndex > writeIndex);
    assert.ok(visibleStateIndex > failureEventIndex);
    assert.ok(visibleMessageIndex > visibleStateIndex);
  });

  it("keeps the original queue when persistence of server acknowledgements fails", async () => {
    const source = await readFile(
      "src/components/offline/OfflineSyncManager.tsx",
      "utf8",
    );
    const remainingIndex = source.indexOf("const remaining = queue.filter");
    const persistIndex = source.indexOf("if (!writeQueue(remaining))");
    const failureIndex = source.indexOf(
      "return { ok: false, pending: queue.length }",
      persistIndex,
    );
    assert.ok(remainingIndex >= 0);
    assert.ok(persistIndex > remainingIndex);
    assert.ok(failureIndex > persistIndex);
  });
});
