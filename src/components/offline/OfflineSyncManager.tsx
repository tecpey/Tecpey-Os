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
  scopeToken: string;
};

type OfflineSyncResponse = {
  results?: OfflineSyncResult[];
};

type OfflineScopeResponse = {
  scopeToken?: string | null;
  scopeExpiresAt?: string | null;
};

type StoredScope = {
  token: string;
  expiresAt: string;
};

const STORAGE_KEY = "tecpey_offline_queue_v2";
const LEGACY_STORAGE_KEY = "tecpey_offline_queue_v1";
const LAST_SYNC_KEY = "tecpey_offline_last_sync_v1";
const SCOPE_KEY = "tecpey_offline_principal_scope_v1";

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

function readScope(): StoredScope | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCOPE_KEY) || "null") as
      | StoredScope
      | null;
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeScope(scope: StoredScope | null) {
  if (typeof window === "undefined") return;
  if (!scope) window.localStorage.removeItem(SCOPE_KEY);
  else window.localStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
}

async function refreshPrincipalScope(): Promise<StoredScope | null> {
  if (!navigator.onLine) return readScope();
  try {
    const response = await fetch("/api/offline-sync?locale=fa", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return readScope();
    const data = (await response.json().catch(() => null)) as OfflineScopeResponse | null;
    if (
      typeof data?.scopeToken === "string" &&
      typeof data.scopeExpiresAt === "string" &&
      Date.parse(data.scopeExpiresAt) > Date.now()
    ) {
      const scope = { token: data.scopeToken, expiresAt: data.scopeExpiresAt };
      writeScope(scope);
      return scope;
    }

    // An authenticated Academy profile is required to mint a scope. Clearing
    // it while online prevents post-logout events from inheriting the previous
    // account's browser partition. Existing queued items keep their own token.
    writeScope(null);
    return null;
  } catch {
    return readScope();
  }
}

export function queueOfflineEvent(
  eventType: OfflineEventType,
  payload: Record<string, unknown> = {},
  locale: "fa" | "en" = "fa",
): string {
  const scope = readScope();
  if (!scope) {
    window.dispatchEvent(new CustomEvent("tecpey-offline-scope-required"));
    return "";
  }

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
    scopeToken: scope.token,
  };
  writeQueue([...readQueue(), item]);
  return item.id;
}

async function syncQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) {
    return { ok: true, pending: queue.length };
  }

  const currentScope = await refreshPrincipalScope();
  if (!currentScope) return { ok: false, pending: queue.length };

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
    // Legacy unscoped commands cannot be safely attributed to any principal.
    // Keep them out of the v2 queue rather than silently assigning them to the
    // next authenticated account.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

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
        await refreshPrincipalScope();
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
