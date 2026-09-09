"use client";

import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Flame,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  NOTIFICATION_CLASSES,
  type NotificationClass,
} from "@/lib/notifications/types";

type Locale = "fa" | "en";
type LoadState = "loading" | "ready" | "error";
type NotificationSurface = "floating" | "compact" | "navbar";

type NotificationItem = {
  id: string;
  notificationClass: NotificationClass;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: number;
  readAt: string | null;
};

type NotificationInbox = {
  locale: Locale;
  items: NotificationItem[];
  unread: number;
  loadState: Exclude<LoadState, "loading">;
};

function parseNotificationItem(value: unknown): NotificationItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const notificationClass = candidate.notificationClass as NotificationClass;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.body !== "string" ||
    !NOTIFICATION_CLASSES.includes(notificationClass)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    notificationClass,
    title: candidate.title,
    body: candidate.body,
    actionUrl:
      typeof candidate.actionUrl === "string" ? candidate.actionUrl : null,
    priority: Number.isInteger(candidate.priority)
      ? Number(candidate.priority)
      : 1,
    readAt: typeof candidate.readAt === "string" ? candidate.readAt : null,
  };
}

function iconFor(notificationClass: NotificationClass) {
  if (notificationClass === "mentor_ai") return MessageCircle;
  if (notificationClass === "academy") return GraduationCap;
  if (
    notificationClass === "social" ||
    notificationClass === "marketing_campaign"
  ) {
    return Sparkles;
  }
  if (notificationClass === "news_market_intelligence") return Flame;
  if (
    notificationClass === "security_critical" ||
    notificationClass === "financial_transactional" ||
    notificationClass === "legal_compliance_service" ||
    notificationClass === "trading_arena" ||
    notificationClass === "admin_operations"
  ) {
    return ShieldCheck;
  }
  return Bell;
}

function safeActionUrl(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function NotificationCenter({
  locale = "fa",
  compact = false,
  surface,
}: {
  locale?: Locale;
  compact?: boolean;
  surface?: NotificationSurface;
}) {
  const isFa = locale === "fa";
  const resolvedSurface: NotificationSurface =
    surface ?? (compact ? "compact" : "floating");
  const isNavbar = resolvedSurface === "navbar";
  const isCompact = compact || isNavbar;
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingReads = useRef(new Map<string, string>());
  const panelId = `tecpey-notification-center-${resolvedSurface}`;

  const currentInbox = inbox?.locale === locale ? inbox : null;
  const items = currentInbox?.items ?? [];
  const unread = currentInbox?.unread ?? 0;
  const loadState: LoadState = currentInbox?.loadState ?? "loading";
  const topItems = items.slice(0, isCompact ? 4 : 12);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;

      try {
        const response = await fetch(`/api/notifications?locale=${locale}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error("notification_inbox_unavailable");

        const data = (await response.json()) as {
          notifications?: unknown;
          unread?: unknown;
        };
        if (disposed || requestController.signal.aborted) return;

        const notifications = Array.isArray(data.notifications)
          ? data.notifications
              .map(parseNotificationItem)
              .filter(
                (item: NotificationItem | null): item is NotificationItem =>
                  Boolean(item),
              )
          : [];

        const optimisticReads = new Map(pendingReads.current);
        let optimisticUnreadAdjustment = 0;
        const reconciledNotifications = notifications.map((item) => {
          const optimisticReadAt = optimisticReads.get(item.id);
          if (!optimisticReadAt || item.readAt) return item;
          optimisticUnreadAdjustment += 1;
          return { ...item, readAt: optimisticReadAt };
        });
        const serverUnread = Number.isFinite(Number(data.unread))
          ? Math.max(0, Number(data.unread))
          : 0;

        setInbox({
          locale,
          items: reconciledNotifications,
          unread: Math.max(0, serverUnread - optimisticUnreadAdjustment),
          loadState: "ready",
        });
      } catch {
        if (disposed || requestController.signal.aborted) return;
        setInbox((previous) => {
          if (previous?.locale === locale && previous.loadState === "ready") {
            return previous;
          }
          return {
            locale,
            items: [],
            unread: 0,
            loadState: "error",
          };
        });
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 45_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [locale]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.readAt || pendingReads.current.has(id)) return;

    const requestLocale = locale;
    const optimisticReadAt = new Date().toISOString();
    pendingReads.current.set(id, optimisticReadAt);
    setInbox((previous) => {
      if (!previous || previous.locale !== requestLocale) return previous;
      const current = previous.items.find((item) => item.id === id);
      if (!current || current.readAt) return previous;
      return {
        ...previous,
        items: previous.items.map((item) =>
          item.id === id ? { ...item, readAt: optimisticReadAt } : item,
        ),
        unread: Math.max(0, previous.unread - 1),
      };
    });

    try {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "read" }),
          keepalive: true,
        },
      );
      if (!response.ok) throw new Error("notification_read_failed");
    } catch {
      setInbox((previous) => {
        if (!previous || previous.locale !== requestLocale) return previous;

        let reverted = false;
        const revertedItems = previous.items.map((item) => {
          if (item.id !== id || item.readAt !== optimisticReadAt) return item;
          reverted = true;
          return { ...item, readAt: null };
        });
        if (!reverted) return previous;

        return {
          ...previous,
          items: revertedItems,
          unread: previous.unread + 1,
        };
      });
    } finally {
      if (pendingReads.current.get(id) === optimisticReadAt) {
        pendingReads.current.delete(id);
      }
    }
  };

  const rootClass = isNavbar
    ? "relative z-[140]"
    : resolvedSurface === "compact"
      ? "relative"
      : "fixed bottom-24 left-4 z-50 md:left-8";
  const triggerClass = isNavbar
    ? "relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg transition-colors hover:bg-fg/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    : "relative inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-slate-950/90 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-cyan-500/15 backdrop-blur transition hover:border-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300";
  const panelClass = isNavbar
    ? "absolute end-0 top-12 z-[160] w-[min(92vw,420px)] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/98 text-white shadow-[0_24px_80px_rgba(2,8,23,.38)] backdrop-blur-xl"
    : "absolute bottom-16 left-0 w-[min(92vw,390px)] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/95 text-white shadow-2xl shadow-cyan-500/20 backdrop-blur-xl";

  return (
    <div
      ref={rootRef}
      className={rootClass}
      dir={isFa ? "rtl" : "ltr"}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={triggerClass}
        aria-label={isFa ? "مرکز اعلان‌های تک‌پی" : "TecPey notification center"}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
      >
        <Bell className={`h-5 w-5 ${isNavbar ? "" : "text-cyan-200"}`} aria-hidden="true" />
        {!isCompact && <span>{isFa ? "مرکز اعلان‌ها" : "Notification Center"}</span>}
        {unread > 0 && (
          <span
            className={`absolute rounded-full bg-rose-500 px-2 py-0.5 text-[11px] text-white ${isNavbar ? "-end-1 -top-1" : "-right-2 -top-2"}`}
            aria-label={isFa ? `${unread} اعلان خوانده‌نشده` : `${unread} unread notifications`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={isFa ? "اعلان‌های تک‌پی" : "TecPey notifications"}
          className={panelClass}
        >
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <p className="text-sm font-black text-cyan-200">
                {isFa ? "مرکز اعلان‌های تک‌پی" : "TecPey Notification Center"}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                {isFa
                  ? "پیام‌های تأییدشده آکادمی، آرنا، امنیت و پشتیبانی"
                  : "Verified Academy, Arena, security and support messages"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => triggerRef.current?.focus(), 0);
              }}
              className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              aria-label={isFa ? "بستن مرکز اعلان‌ها" : "Close notification center"}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[min(56dvh,440px)] space-y-2 overflow-y-auto overscroll-contain p-3">
            {loadState === "loading" && (
              <div
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-bold text-slate-300"
                role="status"
              >
                {isFa ? "در حال دریافت اعلان‌ها…" : "Loading notifications…"}
              </div>
            )}
            {loadState === "error" && (
              <div
                className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm font-bold leading-6 text-amber-100"
                role="alert"
              >
                {isFa
                  ? "مرکز اعلان‌ها موقتاً در دسترس نیست. برای جلوگیری از نمایش اطلاعات نادرست، وضعیت خالی ساختگی نشان داده نمی‌شود."
                  : "The notification center is temporarily unavailable. A fabricated empty state is not shown."}
              </div>
            )}
            {loadState === "ready" && topItems.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-bold text-slate-300">
                {isFa
                  ? "در حال حاضر اعلان تأییدشده‌ای برای تو وجود ندارد."
                  : "You currently have no verified notifications."}
              </div>
            )}

            {topItems.map((item) => {
              const Icon = iconFor(item.notificationClass);
              const href = safeActionUrl(item.actionUrl);
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-3 ${
                    item.readAt
                      ? "border-white/10 bg-white/5"
                      : "border-cyan-300/25 bg-cyan-400/10"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="mt-1 grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black leading-6">{item.title}</p>
                      <p className="mt-1 text-xs font-bold leading-6 text-slate-300">
                        {item.body}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {href && (
                          <Link
                            href={href}
                            onClick={() => void markRead(item.id)}
                            className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                          >
                            {isFa ? "مشاهده" : "Open"}
                          </Link>
                        )}
                        {!item.readAt && (
                          <button
                            type="button"
                            onClick={() => void markRead(item.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                          >
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {isFa ? "علامت‌گذاری به‌عنوان خوانده‌شده" : "Mark as read"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="border-t border-white/10 p-3">
            <Link
              href={isFa ? "/academy/notifications" : "/en/academy/notifications"}
              onClick={() => setOpen(false)}
              className="block rounded-2xl border border-cyan-300/25 bg-white/5 px-4 py-3 text-center text-sm font-black text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {isFa ? "مشاهده همه اعلان‌ها" : "View all notifications"}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
