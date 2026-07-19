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
import { useEffect, useMemo, useState } from "react";

type Locale = "fa" | "en";
type NotificationClass =
  | "security_critical"
  | "financial_transactional"
  | "legal_compliance_service"
  | "academy"
  | "trading_arena"
  | "mentor_ai"
  | "social"
  | "news_market_intelligence"
  | "product_support"
  | "marketing_campaign"
  | "admin_operations";

type NotificationItem = {
  id: string;
  notificationClass: NotificationClass;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: number;
  readAt: string | null;
};

type BrainSnapshot = {
  returnProbability?: number;
  churnRisk?: number;
  bestChannel?: string;
  bestTimeLabel?: string;
  nextHookType?: string;
  messageTitle?: string;
  messageBody?: string;
  nextActionUrl?: string;
};

const NOTIFICATION_CLASSES = new Set<NotificationClass>([
  "security_critical",
  "financial_transactional",
  "legal_compliance_service",
  "academy",
  "trading_arena",
  "mentor_ai",
  "social",
  "news_market_intelligence",
  "product_support",
  "marketing_campaign",
  "admin_operations",
]);

function parseNotificationItem(value: unknown): NotificationItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const notificationClass = candidate.notificationClass as NotificationClass;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.body !== "string" ||
    !NOTIFICATION_CLASSES.has(notificationClass)
  ) {
    return null;
  }

  const priority = Number(candidate.priority);
  return {
    id: candidate.id,
    notificationClass,
    title: candidate.title,
    body: candidate.body,
    actionUrl: typeof candidate.actionUrl === "string" ? candidate.actionUrl : null,
    priority: Number.isInteger(priority) ? priority : 1,
    readAt: typeof candidate.readAt === "string" ? candidate.readAt : null,
  };
}

function iconFor(notificationClass: NotificationClass) {
  if (notificationClass === "mentor_ai") return MessageCircle;
  if (notificationClass === "academy") return GraduationCap;
  if (notificationClass === "social" || notificationClass === "marketing_campaign") {
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

function safeActionUrl(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/academy/profile";
}

export function NotificationCenter({
  locale = "fa",
  compact = false,
}: {
  locale?: Locale;
  compact?: boolean;
}) {
  const isFa = locale === "fa";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [brain, setBrain] = useState<BrainSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      Promise.all([
        fetch(`/api/notifications?locale=${locale}`, { cache: "no-store" }).then(
          async (response) => {
            if (!response.ok) throw new Error("notification_inbox_unavailable");
            return response.json();
          },
        ),
        fetch(`/api/notification-brain?locale=${locale}`, { cache: "no-store" })
          .then((response) => response.json())
          .catch(() => null),
      ])
        .then(([data, brainData]) => {
          if (!active) return;
          const notifications = Array.isArray(data?.notifications)
            ? data.notifications
                .map(parseNotificationItem)
                .filter((item: NotificationItem | null): item is NotificationItem => Boolean(item))
            : [];
          setItems(notifications);
          setUnread(Number.isFinite(Number(data?.unread)) ? Math.max(0, Number(data.unread)) : 0);
          setBrain(brainData?.brain || null);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [locale]);

  const topItems = useMemo(
    () => items.slice(0, compact ? 4 : 12),
    [items, compact],
  );

  const markRead = (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.readAt) return;

    const optimisticReadAt = new Date().toISOString();
    setItems((previous) =>
      previous.map((item) =>
        item.id === id && !item.readAt
          ? { ...item, readAt: optimisticReadAt }
          : item,
      ),
    );
    setUnread((value) => Math.max(0, value - 1));

    void fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) throw new Error("notification_read_failed");
      })
      .catch(() => {
        setItems((previous) =>
          previous.map((item) =>
            item.id === id && item.readAt === optimisticReadAt
              ? { ...item, readAt: null }
              : item,
          ),
        );
        setUnread((value) => value + 1);
      });
  };

  return (
    <div
      className={compact ? "relative" : "fixed bottom-24 left-4 z-50 md:left-8"}
      dir={isFa ? "rtl" : "ltr"}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-slate-950/90 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-cyan-500/15 backdrop-blur transition hover:border-cyan-200"
        aria-label={isFa ? "مرکز اعلان‌های تک‌پی" : "TecPey notification center"}
      >
        <Bell className="h-5 w-5 text-cyan-200" />
        {!compact && <span>{isFa ? "مرکز هوشمند" : "Smart Center"}</span>}
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-16 left-0 w-[min(92vw,390px)] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/95 text-white shadow-2xl shadow-cyan-500/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <p className="text-sm font-black text-cyan-200">
                TecPey Intelligence Center
              </p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                {isFa
                  ? "هوک‌های یادگیری، منتور، شبیه‌ساز و جامعه"
                  : "Learning, mentor, simulator and community hooks"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-white/10 p-2 text-slate-300 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {brain && (
            <div className="border-b border-white/10 p-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                <p className="text-xs font-black text-cyan-100">
                  {isFa ? "تحلیل هوشمند بازگشت" : "Return intelligence"}
                </p>
                <p className="mt-2 text-sm font-black leading-6">
                  {brain.messageTitle}
                </p>
                <p className="mt-1 text-xs font-bold leading-6 text-slate-300">
                  {brain.messageBody}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black text-slate-300">
                  <span className="rounded-xl bg-white/5 px-2 py-2">
                    {isFa ? "بازگشت" : "Return"}: {brain.returnProbability ?? 0}%
                  </span>
                  <span className="rounded-xl bg-white/5 px-2 py-2">
                    {isFa ? "ریزش" : "Churn"}: {brain.churnRisk ?? 0}%
                  </span>
                  <span className="rounded-xl bg-white/5 px-2 py-2">
                    {brain.bestChannel || "in_app"}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
            {topItems.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-bold text-slate-300">
                {isFa
                  ? "اعلان تازه‌ای نداری؛ مسیر آکادمی همیشه آماده ادامه است."
                  : "No new notifications; your academy path is ready whenever you return."}
              </div>
            )}
            {topItems.map((item) => {
              const Icon = iconFor(item.notificationClass);
              const href = safeActionUrl(item.actionUrl);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 ${
                    item.readAt
                      ? "border-white/10 bg-white/5"
                      : "border-cyan-300/25 bg-cyan-400/10"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="mt-1 grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black leading-6">{item.title}</p>
                      <p className="mt-1 text-xs font-bold leading-6 text-slate-300">
                        {item.body}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={href}
                          onClick={() => markRead(item.id)}
                          className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950"
                        >
                          {isFa ? "مشاهده" : "Open"}
                        </Link>
                        {!item.readAt && (
                          <button
                            type="button"
                            onClick={() => markRead(item.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-200"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            {isFa ? "خوانده شد" : "Read"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/10 p-3">
            <Link
              href="/academy/notifications"
              className="block rounded-2xl border border-cyan-300/25 bg-white/5 px-4 py-3 text-center text-sm font-black text-cyan-100"
            >
              {isFa ? "مشاهده همه اعلان‌ها" : "View all notifications"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
