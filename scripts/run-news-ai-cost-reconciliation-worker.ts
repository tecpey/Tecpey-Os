import { hostname } from "node:os";

import { withTx } from "../src/lib/db";

const FAILURE_REASON = "reservation_expired_after_egress";

type ExpiredAttempt = {
  attempt_id: string;
  reserved_usd_micros: string | number;
};

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const result = await withTx(async (client) => {
    const days = await client.query<{ budget_day: string | Date }>(
      `SELECT DISTINCT budget_day
         FROM platform_news_ai_provider_attempts
        WHERE status = 'egress_started'
          AND expires_at <= NOW()
        ORDER BY budget_day`,
    );

    let reconciledAttempts = 0;
    let reconciledUsdMicros = 0;
    const reconciledDays: string[] = [];

    for (const row of days.rows) {
      const budgetDay = row.budget_day instanceof Date
        ? row.budget_day.toISOString().slice(0, 10)
        : String(row.budget_day).slice(0, 10);

      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`news-ai-budget:${budgetDay}`],
      );

      const expired = await client.query<ExpiredAttempt>(
        `SELECT attempt_id::text, reserved_usd_micros
           FROM platform_news_ai_provider_attempts
          WHERE budget_day = $1::date
            AND status = 'egress_started'
            AND expires_at <= NOW()
          ORDER BY attempt_id
          FOR UPDATE`,
        [budgetDay],
      );
      if (expired.rows.length === 0) continue;

      const reservedTotal = expired.rows.reduce((sum, attempt) => {
        const reserved = Number(attempt.reserved_usd_micros);
        if (!Number.isSafeInteger(reserved) || reserved < 0) {
          throw new Error("news_ai_reconciliation_reservation_invalid");
        }
        return sum + reserved;
      }, 0);

      const settled = await client.query(
        `UPDATE platform_news_ai_provider_attempts
            SET status = 'settled',
                settled_usd_micros = reserved_usd_micros,
                cost_source = 'reservation_fallback',
                failure_reason = $2,
                reconciliation_required = TRUE,
                settled_at = NOW(),
                updated_at = NOW()
          WHERE budget_day = $1::date
            AND status = 'egress_started'
            AND expires_at <= NOW()`,
        [budgetDay, FAILURE_REASON],
      );
      if (settled.rowCount !== expired.rows.length) {
        throw new Error("news_ai_reconciliation_attempt_count_invariant");
      }

      const budget = await client.query(
        `UPDATE platform_news_ai_budget_daily
            SET active_reserved_usd_micros = active_reserved_usd_micros - $2,
                settled_usd_micros = settled_usd_micros + $2,
                updated_at = NOW()
          WHERE budget_day = $1::date
            AND active_reserved_usd_micros >= $2`,
        [budgetDay, reservedTotal],
      );
      if (budget.rowCount !== 1) {
        throw new Error("news_ai_reconciliation_budget_invariant");
      }

      reconciledAttempts += expired.rows.length;
      reconciledUsdMicros += reservedTotal;
      reconciledDays.push(budgetDay);
    }

    return {
      reconciledAttempts,
      reconciledUsdMicros,
      reconciledDays,
    };
  });

  console.log(JSON.stringify({
    status: "ok",
    mode: "news_ai_cost_reconciliation",
    host: hostname(),
    aiCalls: 0,
    ...result,
    startedAt,
    finishedAt: new Date().toISOString(),
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed_closed",
    mode: "news_ai_cost_reconciliation",
    aiCalls: 0,
    reason: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
