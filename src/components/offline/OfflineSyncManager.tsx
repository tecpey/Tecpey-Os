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

type PendingOfflineQueueItem = Omit<OfflineQueueItem, "scopeToken">;

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
const LEGACY_QUARANTINE_KEY = "tecpey_offline_queue_unscoped_quarantine_v1";
const LAST_SYNC_KEY = "tecpey_offline_last_sync_v1";
const SCOPE_KEY = "tecpey_offline_principal_scope_v1";
const MAX_QUEUE_ITEMS = 200;
let scopeRefreshInFlight: Promise<StoredScope | null> | null = null;

// Single audited browser-storage boundary. Values here are transport-only and
// never authoritative; PostgreSQL commit evidence remains the source of truth.
function transportStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readQueue(): OfflineQueueItem[] {
  const store = transportStorage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueueItem[]): boolean {
  const store = transportStorage();
  if (!store || items.length > MAX_QUEUE_ITEMS) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("tecpey-offline-queue-changed"));
    return true;
  } catch {
    return false;
  }
}

function reportQueueWriteFailure(eventId: string) {
  window.dispatchEvent(
    new CustomEvent("tecpey-offline-queue-write-failed", {
      detail: { eventId },
    }),
  );
}

function enqueueScopedItem(
  item: PendingOfflineQueueItem,
  scope: StoredScope,
): boolean {
  const queued = writeQueue([...readQueue(), { ...item, scopeToken: scope.token }]);
  if (!queued) reportQueueWriteFailure(item.id);
  return queued;
}

function quarantineLegacyQueue() {
  const store = transportStorage();
  if (!store) return;
  const legacy = store.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return;
  try {
    if (!store.getItem(LEGACY_QUARANTINE_KEY)) {
      store.setItem(LEGACY_QUARANTINE_KEY, legacy);
    }
    store.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Preserve the original queue if quarantine cannot be written atomically.
  }
}

function readScope(): StoredScope | null {
  const store = transportStorage();
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(SCOPE_KEY) || "null") as
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
  const store = transportStorage();
  if (!store) return;
  try {
    if (!scope) store.removeItem(SCOPE_KEY);
    else store.setItem(SCOPE_KEY, JSON.stringify(scope));
  } catch {
    // Scope refresh remains unavailable; callers surface that state visibly.
  }
}

async function fetchPrincipalScope(): Promise<StoredScope | null> {
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

function refreshPrincipalScope(): Promise<StoredScope | null> {
  if (!scopeRefreshInFlight) {
    scopeRefreshInFlight = fetchPrincipalScope().finally(() => {
      scopeRefreshInFlight = null;
    });
  }
  return scopeRefreshInFlight;
}

export function queueOfflineEvent(
  eventType: OfflineEventType,
  payload: Record<string, unknown> = {},
  locale: "fa" | "en" = "fa",
): string {
  const baseItem: PendingOfflineQueueItem = {
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
  const scope = readScope();
  if (scope) {
    enqueueScopedItem(baseItem, scope);
  } else {
    // The first event may arrive before the global manager finishes loading the
    // signed principal scope. Resolve that race before deciding the event cannot
    // be recorded; never attribute an unscoped event to a later account.
    void refreshPrincipalScope().then((freshScope) => {
      if (freshScope) {
        enqueueScopedItem(baseItem, freshScope);
        return;
      }
      window.dispatchEvent(
        new CustomEvent("tecpey-offline-scope-required", {
          detail: { eventId: baseItem.id },
        }),
      );
    });
  }
  return baseItem.id;
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
  const remaining = queue.filter((item) => !terminal.has(item.id));
  if (!writeQueue(remaining)) {
    return { ok: false, pending: queue.length };
  }
  try {
    transportStorage()?.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    // Last-sync metadata is non-authoritative and may safely be omitted.
  }
  return { ok: true, pending: remaining.length };
}

export function OfflineSyncManager() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [scopeRequired, setScopeRequired] = useState(false);
  const [queueWriteFailed, setQueueWriteFailed] = useState(false);

  const label = useMemo(() => {
    if (queueWriteFailed) {
      return "حافظه آفلاین پر یا غیرقابل‌دسترسی است؛ این رویداد ثبت نشد";
    }
    if (scopeRequired) return "برای ثبت آفلاین، ابتدا وارد حساب آکادمی شوید";
    if (!online) return "حالت آفلاین فعال است؛ داده‌ها بعداً همگام می‌شوند";
    if (syncing) return "در حال همگام‌سازی تمرین‌های ذخیره‌شده…";
    if (pending > 0) return `${pending} رویداد آماده همگام‌سازی`;
    return "همگام‌سازی آماده";
  }, [online, pending, queueWriteFailed, scopeRequired, syncing]);

  useEffect(() => {
    // Legacy commands had no principal binding. Preserve them in quarantine for
    // recovery/support, but never migrate them into a current account's queue.
    quarantineLegacyQueue();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
    const refresh = () => {
      setOnline(navigator.onLine);
      setPending(readQueue().length);
    };
    const requireScope = () => setScopeRequired(true);
    const reportWriteFailure = () => setQueueWriteFailed(true);
    const runSync = async () => {
      refresh();
      if (!navigator.onLine) return;
      setSyncing(true);
      try {
        const scope = await refreshPrincipalScope();
        setScopeRequired(!scope);
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
    window.addEventListener("tecpey-offline-scope-required", requireScope);
    window.addEventListener(
      "tecpey-offline-queue-write-failed",
      reportWriteFailure,
    );
    window.addEventListener("focus", runSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", runSync);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tecpey-offline-queue-changed", refresh);
      window.removeEventListener("tecpey-offline-scope-required", requireScope);
      window.removeEventListener(
        "tecpey-offline-queue-write-failed",
        reportWriteFailure,
      );
      window.removeEventListener("focus", runSync);
    };
  }, []);

  if (online && pending === 0 && !scopeRequired && !queueWriteFailed) return null;
  return (
    <div
      className="fixed bottom-4 left-4 z-[70] max-w-[calc(100vw-2rem)] rounded-2xl border border-cyan-300/20 bg-slate-950/92 px-4 py-3 text-xs font-black text-white shadow-2xl shadow-cyan-500/10 backdrop-blur-xl"
      dir="rtl"
      role="status"
      aria-live="polite"
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
