import { readFile } from "node:fs/promises";

const path = "src/components/offline/OfflineSyncManager.tsx";
const source = await readFile(path, "utf8");
const failures = [];

const requireText = (text, reason) => {
  if (!source.includes(text)) failures.push(reason);
};
const rejectText = (text, reason) => {
  if (source.includes(text)) failures.push(reason);
};

requireText("const MAX_QUEUE_ITEMS = 200", "offline transport queue needs an explicit bounded capacity");
requireText("function writeQueue(items: OfflineQueueItem[]): boolean", "queue writes must return durable browser-write evidence");
requireText("items.length > MAX_QUEUE_ITEMS", "queue capacity must reject overflow before writing");
requireText("store.setItem(STORAGE_KEY, JSON.stringify(items))", "queue writes must preserve the complete uncommitted set");
requireText("reportQueueWriteFailure", "queue write failure must be visible to the user");
requireText("tecpey-offline-queue-write-failed", "queue write failure needs an explicit browser event");
requireText("setQueueWriteFailed(true)", "the global manager must surface queue write failure");
requireText("حافظه آفلاین پر یا غیرقابل‌دسترسی است", "the UI must explain that the event was not recorded");
requireText("const remaining = queue.filter", "only server-terminal command IDs may be removed");
requireText("if (!writeQueue(remaining))", "failed acknowledgement persistence must remain a failed sync");
rejectText("slice(-200)", "uncommitted commands may never be silently truncated");
rejectText("slice(0, 200)", "uncommitted commands may never be silently truncated");

if (failures.length) {
  console.error(`Offline queue capacity check failed (${path}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Offline queue capacity check passed: overflow and quota failures are visible, the existing queue is preserved, and uncommitted commands are never truncated.");
