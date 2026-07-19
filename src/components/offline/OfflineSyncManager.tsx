"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, RotateCw } from "lucide-react";
import {
  normalizeOfflineSyncItem,
  type OfflineEventType,
  type OfflineSyncItem,
  type OfflineSyncResult,
} from "@/lib/offline-sync";

const STORAGE_KEY = "tecpey_offline_queue_v1";
const REJECTED_KEY = "tecpey_offline_rejected_v1";
const LAST_SYNC_KEY = "tecpey_offline_last_sync_v1";

function secureClientEventId(): string | null {
  if (typeof crypto === "undefined") return null;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto.getRandomValues !== "function") return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readQueue(): OfflineSyncItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeOfflineSyncItem)
      .filter(
        (result): result is { ok: true; item: OfflineSyncItem } => result.ok,
      )
      .map((result) => result.item)
      .slice(-200);
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineSyncItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-200)));
  window.dispatchEvent(new CustomEvent("tecpey-offline-queue-changed"));
}

function archiveRejected(
  queue: OfflineSyncItem[],
  results: OfflineSyncResult[],
): void {
  if (typeof window === "undefined") return;
  const rejectedById = new Map(
    results
      .filter((result) => result.status === "rejected")
      .map((result) => [result.id, result.reason || "rejected"]),
  );
  if (rejectedById.size === 0) return;
  try {
    const existing = JSON.parse(
      window.localStorage.getItem(REJECTED_KEY) || "[]",
    ) as unknown;
    const previous = Array.isArray(existing) ? existing : [];
    const additions = queue
      .filter((item) => rejectedById.has(item.id))
      .map((item) => ({
        item,
        reason: rejectedById.get(item.id),
        rejectedAt: new Date().toISOString(),
      }));
    window.localStorage.setItem(
      REJECTED_KEY,
      JSON.stringify([...previous, ...additions].slice(-100)),
    );
  } catch {
    // A rejected command is never reclassified as accepted because local audit storage failed.
  }
}

export function queueOfflineEvent(
  eventType: OfflineEventType,
  payload: Record<string, unknown> = {},
  locale: "fa" | "en" = "fa",
): string | null {
  const id = secureClientEventId();
  if (!id) return null;
  const normalized = normalizeOfflineSyncItem({
    id,
    eventType,
    source: "web",
    locale,
    clientCreatedAt: new Date().toISOString(),
    payload,
  });
  if (!normalized.ok) return null;
  const queue = readQueue();
  writeQueue([...queue, normalized.item]);
  return normalized.item.id;
}

async function syncQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) {
    return { ok: true, pending: queue.length };
  }
  const response = await fetch("/api/offline-sync", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: queue }),
  });
  if (!response.ok) return { ok: false, pending: queue.length };
  const data = (await response.json().catch(() => null)) as {
    results?: OfflineSyncResult[];
  } | null;
  const results = Array.isArray(data?.results) ? data.results : [];
  const accepted = new Set(
    results
      .filter((result) => result.status === "accepted")
      .map((result) => result.id),
  );
  const rejected = new Set(
    results
      .filter((result) => result.status === "rejected")
      .map((result) => result.id),
  );
  archiveRejected(queue, results);
  writeQueue(
    queue.filter((item) => !accepted.has(item.id) && !rejected.has(item.id)),
  );
  window.localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  return { ok: true, pending: readQueue().length };
}

export function OfflineSyncManager() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const label = useMemo(() => {
    if (!online) return "حالت آفلاین فعال است؛ داده‌ها بعداً همگام می‌شوند";
    if (syncing) return "در حال همگام‌سازی تمرین‌های ذخیره‌شده…";
    if (pending > 0) return `${pending} رویداد آماده همگام‌سازی`;
    return "همگام‌سازی آماده";
  }, [online, pending, syncing]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
    const refresh = () => {
      setOnline(navigator.onLine);
      setPending(readQueue().length);
    };
    const runSync = async () => {
      refresh();
      if (!navigator.onLine) return;
      setSyncing(true);
      try {
        await syncQueue();
      } finally {
        setSyncing(false);
        refresh();
      }
    };
    refresh();
    void runSync();
    const interval = window.setInterval(() => void runSync(), 45_000);
    window.addEventListener("online", runSync);
    window.addEventListener("offline", refresh);
    window.addEventListener("tecpey-offline-queue-changed", refresh);
    window.addEventListener("focus", runSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", runSync);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tecpey-offline-queue-changed", refresh);
      window.removeEventListener("focus", runSync);
    };
  }, []);

  if (online && pending === 0) return null;
  return (
    <div
      className="fixed bottom-4 left-4 z-[70] max-w-[calc(100vw-2rem)] rounded-2xl border border-cyan-300/20 bg-slate-950/92 px-4 py-3 text-xs font-black text-white shadow-2xl shadow-cyan-500/10 backdrop-blur-xl"
      dir="rtl"
    >
      <div className="flex items-center gap-2">
        {syncing ? (
          <RotateCw className="h-4 w-4 animate-spin text-cyan-300" />
        ) : online ? (
          <Cloud className="h-4 w-4 text-cyan-300" />
        ) : (
          <CloudOff className="h-4 w-4 text-amber-300" />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
