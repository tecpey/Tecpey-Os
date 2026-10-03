"use client";

import dynamic from "next/dynamic";
import {
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Expand,
  Focus,
  GripHorizontal,
  Minimize2,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { MentorArenaPanelState } from "@/lib/mentor-stage-director";
import {
  mentorWorkspaceDirection,
  type MentorWorkspacePlan,
} from "@/lib/mentor-workspace";
import styles from "./MentorArenaDock.module.css";

const loadTradingArenaExecutionClient = () =>
  import("@/components/academy/trading-arena/TradingArenaExecutionClient").then(
    (module) => module.TradingArenaExecutionClient,
  );

const TradingArenaExecutionClientFa = dynamic(loadTradingArenaExecutionClient, {
  ssr: false,
  loading: () => (
    <div className={styles.executionLoading} role="status">
      <span aria-hidden="true" />
      <p>در حال بارگذاری آرنای معتبرشده…</p>
    </div>
  ),
});

const TradingArenaExecutionClientEn = dynamic(loadTradingArenaExecutionClient, {
  ssr: false,
  loading: () => (
    <div className={styles.executionLoading} role="status">
      <span aria-hidden="true" />
      <p>Loading the validated Arena…</p>
    </div>
  ),
});

type MentorArenaDockProps = {
  locale?: string;
  onClose: () => void;
  onDock: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  panel: Exclude<MentorArenaPanelState, "closed">;
  plan: MentorWorkspacePlan;
};

const COPY = {
  fa: {
    title: "آرنای معاملاتی",
    badge: "تمرین مجازی",
    challenge: "چالش انضباط تصمیم",
    description:
      "قبل از هر سفارش، دلیل ورود، نقطه ابطال و حد ضرر را ثبت کن؛ منتور روی فرایند تصمیم نظارت می‌کند، نه سود و زیان.",
    rules: ["برنامه قبل از سفارش", "حد ضرر الزامی", "بدون ورود FOMO"],
    safety: "هیچ سفارش واقعی ارسال نمی‌شود؛ نتیجه شبیه‌سازی تضمین آینده نیست.",
    open: "شروع در محیط اجرایی Arena",
    focus: "نمایش کامل Arena",
    minimize: "کوچک‌کردن Arena",
    restore: "بازگرداندن Arena",
    dock: "بازگشت به نمای یک‌سوم",
    close: "بستن Arena",
    core: "قوانین ایمنی یکسان",
    premium: "ظرفیت پرمیوم؛ قوانین ایمنی یکسان",
  },
  en: {
    title: "Trading Arena",
    badge: "Virtual practice",
    challenge: "Decision-discipline challenge",
    description:
      "Record the entry thesis, invalidation and stop-loss before every order. The mentor evaluates your process—not P&L.",
    rules: ["Plan before order", "Stop-loss required", "No FOMO entries"],
    safety: "No real order is sent. Simulated results do not predict future performance.",
    open: "Start in the authenticated Arena",
    focus: "Open full Arena",
    minimize: "Minimize Arena",
    restore: "Restore Arena",
    dock: "Return to one-third view",
    close: "Close Arena",
    core: "Same safety rules",
    premium: "Premium capacity; same safety rules",
  },
} as const;

export function MentorArenaDock({
  locale = "fa-IR",
  onClose,
  onDock,
  onFocus,
  onMinimize,
  panel,
  plan,
}: MentorArenaDockProps) {
  const isFa = locale.toLowerCase().startsWith("fa");
  const copy = isFa ? COPY.fa : COPY.en;
  const direction = mentorWorkspaceDirection(locale);
  const [isOverlay, setIsOverlay] = useState(false);
  const overlayRef = useRef<HTMLDialogElement | null>(null);
  const restoreRef = useRef<HTMLButtonElement | null>(null);
  const minimized = panel === "minimized";
  const titleId = useId();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1439px)");
    const sync = () => setIsOverlay(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (minimized) {
      restoreRef.current?.focus();
      return;
    }
    if (!isOverlay) return;
    const dialog = overlayRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native modality makes the background inert for pointer, keyboard and
    // assistive technology, including controls loaded after the panel opens.
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [isOverlay, minimized]);

  if (panel === "minimized") {
    return (
      <aside className={styles.minimized} dir={direction} aria-label={copy.title}>
        <button ref={restoreRef} type="button" onClick={onDock} aria-label={copy.restore}>
          <ChartNoAxesCombined aria-hidden="true" />
          <span>
            <strong>{copy.title}</strong>
            <small>{copy.challenge}</small>
          </span>
          {isFa ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </button>
      </aside>
    );
  }

  const panelContent = (
    <section
      className={styles.panel}
      data-panel={panel}
      data-overlay={isOverlay}
      dir={direction}
      aria-labelledby={titleId}
      role={isOverlay ? undefined : "region"}
    >
      <header className={styles.header}>
        <div className={styles.dragCue} aria-hidden="true">
          <GripHorizontal />
        </div>
        <div className={styles.identity}>
          <span><ChartNoAxesCombined aria-hidden="true" /></span>
          <div>
            <h2 id={titleId}>{copy.title}</h2>
            <p><ShieldCheck aria-hidden="true" />{plan === "premium" ? copy.premium : copy.core}</p>
          </div>
        </div>
        <div className={styles.controls}>
          {panel === "focus" ? (
            <button type="button" onClick={onDock} aria-label={copy.dock} title={copy.dock}>
              <Focus aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={onFocus} aria-label={copy.focus} title={copy.focus}>
              <Expand aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onMinimize} aria-label={copy.minimize} title={copy.minimize}>
            <Minimize2 aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label={copy.close} title={copy.close}>
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      {panel === "docked" ? (
        <div className={styles.challenge}>
          <div className={styles.challengeBadge}>
            <Target aria-hidden="true" />
            <span>{copy.badge}</span>
          </div>
          <h3>{copy.challenge}</h3>
          <p>{copy.description}</p>
          <ol>
            {copy.rules.map((rule, index) => (
              <li key={rule}><span>{index + 1}</span>{rule}</li>
            ))}
          </ol>
          <div className={styles.safetyNote}>
            <ShieldCheck aria-hidden="true" />
            <p>{copy.safety}</p>
          </div>
          <button type="button" className={styles.primaryAction} onClick={onFocus}>
            <ChartNoAxesCombined aria-hidden="true" />
            {copy.open}
          </button>
        </div>
      ) : (
        <div className={styles.execution}>
          {isFa ? (
            <TradingArenaExecutionClientFa locale="fa" />
          ) : (
            <TradingArenaExecutionClientEn locale="en" />
          )}
        </div>
      )}
    </section>
  );

  if (!isOverlay) return panelContent;

  return (
    <dialog
      ref={overlayRef}
      className={styles.overlay}
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        // Native modality blocks the page, but some browsers allow Tab to
        // move into browser chrome at the edge. Keep the learning loop local.
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, textarea, [tabindex]",
        )).filter((element) =>
          element.tabIndex >= 0 && !element.matches(":disabled") &&
          !element.closest("[inert]") && element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby={titleId}
      dir={direction}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panelContent}
    </dialog>
  );
}
