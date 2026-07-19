"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, RotateCw } from "lucide-react";
import type { OfflineEventType, OfflineSyncResult } from "@/lib/offline-sync";

type OfflineQueueItem = {
  id: string;
  eventType: OfflineEventType;
  source: "web" | "pwa" | "android" | "ios";
  locale: "fa" | "en";
  clientCreatedAt: string;
  payload: Record<string, unknown>;
};

type OfflineSyncResponse = {
  results?: OfflineSyncResult[];
};

const STORAGE_KEY = "tecpey_offline_queue_v1";
const LAST_SYNC_KEY = "tecpey_offline_last_sync_v1";

function readQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-200)));
  window.dispatchEvent(new CustomEvent("tecpey-offline-queue-changed"));
}

export function queueOfflineEvent(
  eventType: OfflineEventType,
  payload: Record<string, unknown> = {},
  locale: "fa" | "en" = "fa",
) {
  const item: OfflineQueueItem = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `offline_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    eventType,
    source: "web",
    locale,
    clientCreatedAt: new Date().toISOString(),
    payload,
  };
  writeQueue([...readQueue(), item]);
  return item.id;
}

async function syncQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) return { ok: true, pending: queue.length };
  const response = await fetch("/api/offline-sync", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: queue }),
  });

  // A non-2xx response, including storage-unavailable 503, is never an
  // acknowledgement. Preserve every client command for a later retry.
  if (!response.ok) return { ok: false, pending: queue.length };

  const data = (await response.json().catch(() => null)) as OfflineSyncResponse | null;
  const terminal = new Set(
    (data?.results || [])
      .filter((result) => result.status === "committed" || result.status === "rejected")
      .map((result) => result.id),
  );
  writeQueue(queue.filter((item) => !terminal.has(item.id)));
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
