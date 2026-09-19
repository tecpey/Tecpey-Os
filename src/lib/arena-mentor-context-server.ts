import { withDb } from "@/lib/db";
import {
  buildArenaMentorRiskContext,
  createArenaExecutionStateV2,
  type ArenaMentorRiskContextV2,
} from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";

type ArenaMentorRow = {
  starting_balance: string;
  execution_state: unknown;
};

export async function loadArenaMentorRiskContext(
  studentId: string,
  generatedAt = new Date().toISOString(),
): Promise<ArenaMentorRiskContextV2 | null> {
  const result = await withDb(async (client) => {
    const query = await client.query<ArenaMentorRow>(
      `SELECT attempt.starting_balance::text, attempt.execution_state
         FROM academy_trading_arena_accounts account
         JOIN academy_trading_arena_attempts attempt
           ON attempt.student_id = account.student_id
          AND attempt.cycle_id = account.cycle_id
        WHERE account.student_id = $1::uuid
          AND attempt.status = 'active'
        ORDER BY attempt.attempt_number DESC
        LIMIT 1`,
      [studentId],
    );
    const row = query.rows[0];
    if (!row) return null;
    const raw = row.execution_state;
    const empty = Boolean(
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.keys(raw as Record<string, unknown>).length === 0,
    );
    const state = empty
      ? createArenaExecutionStateV2(row.starting_balance, generatedAt)
      : validateArenaExecutionStateV2(raw);
    return buildArenaMentorRiskContext(state, generatedAt);
  });
  return result.enabled ? result.value : null;
}
