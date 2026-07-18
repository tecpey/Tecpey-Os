"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  LoaderCircle,
  Pencil,
  RefreshCw,
} from "lucide-react";
import type { ReflectionEntry } from "@/lib/academy-reflections";

type EditorStatus =
  | "loading"
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "error"
  | "unauthenticated";

type ReflectionResponse = {
  ok?: boolean;
  error?: string;
  reflection?: ReflectionEntry | null;
  revision?: number;
  details?: {
    reflection?: ReflectionEntry | null;
    revision?: number;
  };
};

function currentLocale(): "fa" | "en" {
  if (typeof window === "undefined") return "fa";
  return window.location.pathname.startsWith("/en/") ? "en" : "fa";
}

export function ReflectionPrompt({ prompt, lessonId }: { prompt: string; lessonId: string }) {
  const [text, setText] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [conflict, setConflict] = useState<ReflectionEntry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setStatus("loading");
      try {
        const locale = currentLocale();
        const response = await fetch(
          `/api/academy-reflections?locale=${locale}&lessonId=${encodeURIComponent(lessonId)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({})) as ReflectionResponse;
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error(body.error ?? `reflection_load_failed:${response.status}`);

        const reflection = body.reflection ?? null;
        setText(reflection?.text ?? "");
        setRevision(Number(body.revision) || reflection?.revision || 0);
        setConflict(null);
        setStatus(reflection ? "saved" : "idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("error");
      }
    };

    void load();
    return () => controller.abort();
  }, [lessonId]);

  const save = useCallback(async (overrideRevision?: number) => {
    const normalized = text.trim();
    if (!normalized || status === "saving") return;

    setStatus("saving");
    try {
      const response = await fetch("/api/academy-reflections", {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          locale: currentLocale(),
          lessonId,
          text: normalized,
          expectedRevision: overrideRevision ?? revision,
        }),
      });
      const body = await response.json().catch(() => ({})) as ReflectionResponse;

      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (response.status === 409) {
        const remote = body.details?.reflection ?? null;
        setConflict(remote);
        setRevision(Number(body.details?.revision) || remote?.revision || 0);
        setStatus("conflict");
        return;
      }
      if (!response.ok || !body.reflection) {
        throw new Error(body.error ?? `reflection_write_failed:${response.status}`);
      }

      setText(body.reflection.text);
      setRevision(Number(body.revision) || body.reflection.revision);
      setConflict(null);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [lessonId, revision, status, text]);

  const loadServerVersion = () => {
    setText(conflict?.text ?? "");
    setRevision(conflict?.revision ?? 0);
    setConflict(null);
    setStatus(conflict ? "saved" : "idle");
  };

  const keepMyVersion = () => {
    const remoteRevision = conflict?.revision ?? revision;
    setConflict(null);
    void save(remoteRevision);
  };

  const handleTextChange = (value: string) => {
    setText(value.slice(0, 5000));
    setConflict(null);
    if (status !== "unauthenticated") setStatus("idle");
  };

  const busy = status === "loading" || status === "saving";

  return (
    <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Pencil className="h-5 w-5 text-cyan-300" />
        <h3 className="font-black text-cyan-200">بازتاب یادگیری</h3>
      </div>

      <p className="mb-4 text-sm font-bold leading-7 text-slate-300">{prompt}</p>

      <textarea
        value={text}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder={status === "loading" ? "در حال بازیابی نوشته شما..." : "افکار خود را بنویسید..."}
        rows={4}
        maxLength={5000}
        disabled={status === "loading"}
        className="w-full resize-none rounded-xl border border-white/10 bg-slate-800/60 p-4 text-sm font-bold leading-7 text-slate-200 placeholder-slate-600 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/30 disabled:cursor-wait disabled:opacity-60"
        aria-label="بازتاب یادگیری"
        aria-describedby="reflection-storage-note reflection-status"
      />

      <p id="reflection-storage-note" className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
        <Cloud className="h-3.5 w-3.5" />
        در حساب آکادمی شما ذخیره می‌شود و در دستگاه‌های دیگر قابل بازیابی است.
      </p>

      {status === "conflict" && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4" role="alert">
          <div className="flex items-start gap-2 text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs font-bold leading-6">
              نسخه جدیدتری از این بازتاب روی دستگاه دیگری ذخیره شده است. برای جلوگیری از حذف ناخواسته، ذخیره متوقف شد.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadServerVersion}
              className="rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-black text-amber-100 hover:bg-amber-300/10 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              بارگذاری نسخه سرور
            </button>
            <button
              type="button"
              onClick={keepMyVersion}
              className="rounded-lg bg-amber-300/20 px-3 py-1.5 text-xs font-black text-amber-100 hover:bg-amber-300/30 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              جایگزینی با نوشته من
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-600">{text.length.toLocaleString("fa-IR")} / ۵٬۰۰۰ کاراکتر</span>

        <div id="reflection-status" className="flex min-h-8 items-center justify-end" aria-live="polite">
          {status === "loading" && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> در حال بازیابی
            </span>
          )}
          {status === "saving" && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> در حال ذخیره
            </span>
          )}
          {status === "saved" && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> ذخیره‌شده در حساب
            </span>
          )}
          {status === "error" && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-400/10 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <RefreshCw className="h-3.5 w-3.5" /> تلاش دوباره
            </button>
          )}
          {status === "unauthenticated" && (
            <span className="text-xs font-bold text-amber-300">برای ذخیره، وارد حساب آکادمی شوید.</span>
          )}
          {(status === "idle" || status === "conflict") && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || busy || status === "conflict"}
              className="rounded-xl bg-cyan-400/20 px-4 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-400/30 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              aria-label="ذخیره بازتاب در حساب آکادمی"
            >
              ذخیره
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
