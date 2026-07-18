import type { ArenaAccount, ArenaAttempt } from "@/lib/trading-arena-account";
import type { ArenaExecutionAction } from "@/lib/trading-arena-execution";
import type { TradingArenaState } from "@/lib/trading-arena";

export type ArenaExecutionSnapshot = {
  account: ArenaAccount;
  attempts: ArenaAttempt[];
  activeAttempt: ArenaAttempt | null;
  state: TradingArenaState | null;
  revision: number;
};

type ArenaResponseBody = Partial<ArenaExecutionSnapshot> & {
  ok?: boolean;
  error?: string;
  details?: Partial<ArenaExecutionSnapshot> & { error?: string };
};

export class ArenaExecutionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly snapshot: Partial<ArenaExecutionSnapshot> | null;

  constructor(code: string, status: number, snapshot: Partial<ArenaExecutionSnapshot> | null = null) {
    super(code);
    this.name = "ArenaExecutionError";
    this.code = code;
    this.status = status;
    this.snapshot = snapshot;
  }
}

function parseSnapshot(body: ArenaResponseBody): ArenaExecutionSnapshot {
  if (!body.account || !Array.isArray(body.attempts) || typeof body.revision !== "number") {
    throw new ArenaExecutionError("invalid_arena_response", 502);
  }
  return {
    account: body.account,
    attempts: body.attempts,
    activeAttempt: body.activeAttempt ?? null,
    state: body.state ?? null,
    revision: body.revision,
  };
}

export async function fetchArenaExecutionState(signal?: AbortSignal): Promise<ArenaExecutionSnapshot> {
  const response = await fetch("/api/trading-arena/state", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await response.json().catch(() => ({})) as ArenaResponseBody;
  if (!response.ok || !body.ok) {
    throw new ArenaExecutionError(body.error ?? `arena_state_load_failed:${response.status}`, response.status);
  }
  return parseSnapshot(body);
}

export async function mutateArenaExecutionState(
  action: ArenaExecutionAction | "start_next_attempt",
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<ArenaExecutionSnapshot> {
  const response = await fetch("/api/trading-arena/state", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, expectedRevision }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as ArenaResponseBody;
  if (!response.ok || !body.ok) {
    throw new ArenaExecutionError(
      body.error ?? `arena_state_write_failed:${response.status}`,
      response.status,
      body.details ?? null,
    );
  }
  return parseSnapshot(body);
}
