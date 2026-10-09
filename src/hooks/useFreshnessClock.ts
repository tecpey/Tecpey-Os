"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function update() {
  snapshot = Date.now();
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    update();
    timer = setInterval(update, 1_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      snapshot = 0;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => 0;

/** Deterministic unknown SSR state; one shared browser clock, cleaned on exit. */
export function useFreshnessClock() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
