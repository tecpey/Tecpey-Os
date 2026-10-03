"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./NewsHeadlineRail.module.css";

type Headline = {
  archiveId: string;
  displayTitle: string;
  sourceName: string;
  publishedAt: string;
  translationPending: boolean;
  publicSummaryAllowed: boolean;
};

export function NewsHeadlineRail({ items, totalCount, locale, id, onRead }: {
  items: Headline[];
  totalCount: number;
  locale: "fa" | "en";
  id: string;
  onRead: (index: number) => void;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const cardsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(0);
  const isFa = locale === "fa";
  const number = new Intl.NumberFormat(isFa ? "fa-IR" : "en-US");

  function reveal(index: number) {
    const track = trackRef.current;
    const card = cardsRef.current[index];
    if (!track || !card) return;
    const viewport = track.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    // Physical geometry avoids relying on browser-specific RTL scrollLeft signs.
    track.scrollBy({ left: bounds.left + bounds.width / 2 - viewport.left - viewport.width / 2, behavior: "instant" });
    setActive(index);
  }

  function observeScroll() {
    const track = trackRef.current;
    if (!track) return;
    const viewport = track.getBoundingClientRect();
    const center = viewport.left + viewport.width / 2;
    let closest = 0;
    let distance = Infinity;
    cardsRef.current.forEach((card, index) => {
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      const candidate = Math.abs(bounds.left + bounds.width / 2 - center);
      if (candidate < distance) { closest = index; distance = candidate; }
    });
    setActive(closest);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = items.length - 1;
    else if (event.key === "ArrowRight") target = index + (isFa ? -1 : 1);
    else if (event.key === "ArrowLeft") target = index + (isFa ? 1 : -1);
    else return;
    event.preventDefault();
    target = Math.max(0, Math.min(items.length - 1, target));
    cardsRef.current[target]?.focus({ preventScroll: true });
    reveal(target);
  }

  return (
    <nav id={id} className={styles.rail} aria-label={isFa ? "مرور تیترهای خبر" : "News headlines"}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.heading}>{isFa ? "مرور تیترها" : "Browse the headlines"}</h2>
          <p className={styles.description}>{isFa ? `${number.format(items.length)} تیتر از ${number.format(totalCount)} خبر؛ آرشیو کامل در ادامه است.` : `${number.format(items.length)} headlines from ${number.format(totalCount)} stories; the complete archive follows.`}</p>
        </div>
        <div className={styles.controls}>
          <button type="button" aria-label={isFa ? "تیتر قبلی" : "Previous headline"} aria-controls={`${id}-track`} aria-disabled={active === 0} onClick={() => active > 0 && reveal(active - 1)}>
            {isFa ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          </button>
          <button type="button" aria-label={isFa ? "تیتر بعدی" : "Next headline"} aria-controls={`${id}-track`} aria-disabled={active === items.length - 1} onClick={() => active < items.length - 1 && reveal(active + 1)}>
            {isFa ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        </div>
      </div>
      <ul id={`${id}-track`} ref={trackRef} className={styles.track} onScroll={observeScroll}>
        {items.map((item, index) => (
          <li key={item.archiveId} className={styles.card}>
            <button id={`${id}-card-${index}`} ref={node => { cardsRef.current[index] = node; }} type="button" className={styles.read} data-current={active === index} aria-label={isFa ? `خواندن خبر: ${item.displayTitle}` : `Read story: ${item.displayTitle}`} onFocus={() => reveal(index)} onKeyDown={event => navigate(event, index)} onClick={() => onRead(index)}>
              <span className={styles.metadata}><bdi>{item.sourceName}</bdi><time dateTime={item.publishedAt}>{new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(item.publishedAt))}</time></span>
              <span className={styles.title} dir={isFa && item.translationPending && item.publicSummaryAllowed ? "ltr" : undefined}>{item.displayTitle}</span>
              <span className={styles.action}>{isFa ? "خواندن این خبر" : "Read this story"}<span aria-hidden="true">{isFa ? "←" : "→"}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.position} role="status" aria-live="polite" aria-atomic="true">{isFa ? `تیتر ${number.format(active + 1)} از ${number.format(items.length)}` : `Headline ${number.format(active + 1)} of ${number.format(items.length)}`}</p>
    </nav>
  );
}
