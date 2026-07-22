"use client";

import { useEffect, useState } from "react";
import { GlobalAiMentorWidget } from "./GlobalAiMentorWidget";
import { PublicMentorEntry } from "./PublicMentorEntry";

type MentorEntryStatus = "checking" | "absent" | "ready" | "unavailable";

function parseProfileStatus(payload: unknown): Exclude<MentorEntryStatus, "checking"> {
  if (!payload || typeof payload !== "object") return "unavailable";
  if (!Object.prototype.hasOwnProperty.call(payload, "profile")) {
    return "unavailable";
  }
  const profile = (payload as { profile?: unknown }).profile;
  if (profile === null) return "absent";
  if (!profile || typeof profile !== "object") return "unavailable";
  const displayName = (profile as { display_name?: unknown }).display_name;
  return typeof displayName === "string" && displayName.trim()
    ? "ready"
    : "unavailable";
}

export function GovernedMentorEntry() {
  const [status, setStatus] = useState<MentorEntryStatus>("checking");

  useEffect(() => {
    let active = true;

    const resolveProfile = async () => {
      try {
        const response = await fetch("/api/academy-student-profile", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`academy_profile_status_${response.status}`);
        }
        const payload: unknown = await response.json();
        if (active) setStatus(parseProfileStatus(payload));
      } catch {
        if (active) setStatus("unavailable");
      }
    };

    void resolveProfile();
    window.addEventListener("tecpey-academy-profile-ready", resolveProfile);
    window.addEventListener("focus", resolveProfile);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-profile-ready", resolveProfile);
      window.removeEventListener("focus", resolveProfile);
    };
  }, []);

  if (status === "ready") return <GlobalAiMentorWidget />;
  if (status === "absent") return <PublicMentorEntry />;
  return null;
}
