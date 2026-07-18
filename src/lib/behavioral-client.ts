import type { BehavioralSnapshot } from "@/lib/behavioral-engine";

export async function fetchBehavioralSnapshot(
  locale: "fa" | "en" = "fa",
  signal?: AbortSignal,
): Promise<BehavioralSnapshot> {
  const response = await fetch(`/api/behavioral-snapshot?locale=${locale}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });

  const body = await response.json().catch(() => ({})) as {
    snapshot?: BehavioralSnapshot;
    error?: string;
  };
  if (!response.ok || !body.snapshot) {
    throw new Error(body.error ?? `behavioral_snapshot_failed:${response.status}`);
  }
  return body.snapshot;
}
