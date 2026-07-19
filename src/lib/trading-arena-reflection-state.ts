import {
  createArenaExecutionStateV2,
  type ArenaExecutionStateV2,
} from "./trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "./trading-arena-execution-state-validation";

export function normalizeArenaReflectionExecutionState(
  raw: unknown,
  startingBalance: string,
): ArenaExecutionStateV2 {
  const empty = Boolean(
    raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.keys(raw as Record<string, unknown>).length === 0,
  );

  return empty
    ? createArenaExecutionStateV2(startingBalance)
    : validateArenaExecutionStateV2(raw);
}
