import { createHash } from "node:crypto";

export const DOMAIN_TABLES = Object.freeze({
  academy: Object.freeze([
    "academy_students",
    "academy_lesson_progress",
    "academy_lesson_assessments",
    "academy_certificates",
    "learning_events",
  ]),
  tradingArena: Object.freeze([
    "academy_trading_arena_accounts",
    "academy_trading_arena_attempts",
    "academy_trading_arena_commands",
    "academy_trading_arena_execution_events",
    "academy_trading_arena_reflections",
    "academy_arena_trade_score_ledger",
  ]),
  mentorAi: Object.freeze([
    "mentor_profiles",
    "mentor_memories",
    "mentor_insights",
    "mentor_ai_preferences",
    "ai_mentor_request_evidence",
  ]),
  exchangeLedger: Object.freeze([
    "exchange_order_commands",
    "exchange_order_command_attempts",
    "orders",
    "trades",
    "order_events",
    "wallet_ledger",
    "wallet_balances",
    "audit_events",
  ]),
  notificationsOperationalJobs: Object.freeze([
    "platform_notifications",
    "notification_outbox",
    "notification_delivery_attempts",
    "notification_dead_letters",
    "notification_domain_outbox",
    "notification_domain_outbox_attempts",
    "notification_domain_dead_letters",
    "platform_operational_job_runs",
    "platform_operational_alerts",
    "platform_operational_alert_delivery_attempts",
  ]),
});

export const FINANCIAL_INVARIANT_QUERIES = Object.freeze([
  Object.freeze({
    name: "walletBalanceLedger",
    sql: `WITH replayed AS (
      SELECT wallet_id, asset,
             SUM(CASE
               WHEN type IN ('deposit', 'trade_credit', 'release') THEN amount
               WHEN type IN ('hold', 'trade_debit', 'fee') THEN -amount
               ELSE 0
             END) AS available,
             SUM(CASE
               WHEN type = 'hold' THEN amount
               WHEN type IN ('release', 'withdraw') THEN -amount
               ELSE 0
             END) AS held
        FROM wallet_ledger
       GROUP BY wallet_id, asset
    )
    SELECT COUNT(*)::text AS divergence_count
      FROM wallet_balances balances
      FULL OUTER JOIN replayed ledger
        ON ledger.wallet_id = balances.user_id
       AND ledger.asset = balances.asset
     WHERE COALESCE(balances.available_balance, 0) <> COALESCE(ledger.available, 0)
        OR COALESCE(balances.held_balance, 0) <> COALESCE(ledger.held, 0)`,
  }),
  Object.freeze({
    name: "orderQuantity",
    sql: `SELECT COUNT(*)::text AS divergence_count
      FROM orders
     WHERE filled_quantity + remaining_quantity <> quantity`,
  }),
  Object.freeze({
    name: "orderFillTrade",
    sql: `WITH traded AS (
      SELECT order_id, SUM(quantity) AS quantity
        FROM (
          SELECT buyer_order_id AS order_id, quantity FROM trades
          UNION ALL
          SELECT seller_order_id AS order_id, quantity FROM trades
        ) sides
       GROUP BY order_id
    )
    SELECT COUNT(*)::text AS divergence_count
      FROM orders orders
      LEFT JOIN traded ON traded.order_id = orders.id
     WHERE orders.filled_quantity <> COALESCE(traded.quantity, 0)`,
  }),
  Object.freeze({
    name: "tradeFeeLedger",
    sql: `WITH posted AS (
      SELECT reference_id, SUM(amount) AS amount
        FROM wallet_ledger
       WHERE type = 'fee' AND reference_type = 'trade'
       GROUP BY reference_id
    )
    SELECT COUNT(*)::text AS divergence_count
      FROM trades trades
      LEFT JOIN posted ON posted.reference_id = trades.id::text
     WHERE trades.fee_buyer + trades.fee_seller <> COALESCE(posted.amount, 0)`,
  }),
  Object.freeze({
    name: "terminalOrderHold",
    sql: `WITH residual AS (
      SELECT reference_id,
             SUM(CASE
               WHEN type = 'hold' THEN amount
               WHEN type = 'release' THEN -amount
               ELSE 0
             END) AS amount
        FROM wallet_ledger
       WHERE reference_type = 'order'
       GROUP BY reference_id
    )
    SELECT COUNT(*)::text AS divergence_count
      FROM orders orders
      JOIN residual ON residual.reference_id = orders.id::text
     WHERE orders.status IN ('FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED')
       AND residual.amount <> 0`,
  }),
]);

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export function assertIdentifier(value, label = "identifier") {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`${label}_invalid`);
  }
  return value;
}

export function quoteIdentifier(value) {
  return `"${assertIdentifier(value).replaceAll('"', '""')}"`;
}

export function tableFingerprintQuery(table) {
  const identifier = quoteIdentifier(table);
  return `WITH row_hashes AS (
    SELECT md5(to_jsonb(candidate_row)::text) AS row_hash
      FROM ${identifier} AS candidate_row
  )
  SELECT COUNT(*)::text AS row_count,
         md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS row_digest
    FROM row_hashes`;
}

export function parseSafeCount(value, label) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label}_invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label}_invalid`);
  }
  return parsed;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function summarizeDomain(tableMetrics, extraCounts = {}) {
  if (!Array.isArray(tableMetrics) || tableMetrics.length === 0) {
    throw new Error("domain_table_metrics_invalid");
  }
  const tables = [...tableMetrics]
    .map((entry) => {
      const table = assertIdentifier(entry?.table, "domain_table");
      const rowCount = parseSafeCount(String(entry?.rowCount), `${table}_row_count`);
      if (typeof entry?.rowDigest !== "string" || !/^[a-f0-9]{32}$/.test(entry.rowDigest)) {
        throw new Error(`${table}_row_digest_invalid`);
      }
      return { table, rowCount, rowDigest: entry.rowDigest };
    })
    .sort((left, right) => left.table.localeCompare(right.table));
  if (new Set(tables.map((entry) => entry.table)).size !== tables.length) {
    throw new Error("domain_table_metrics_duplicate");
  }

  const normalizedExtraCounts = {};
  for (const [key, count] of Object.entries(extraCounts)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("domain_extra_counts_invalid");
    }
    normalizedExtraCounts[key] = count;
  }
  return {
    queryDigest: sha256Canonical({ tables, extraCounts: normalizedExtraCounts }),
    rowCounts: {
      tablesCovered: tables.length,
      records: tables.reduce((sum, entry) => sum + entry.rowCount, 0),
      nonEmptyTables: tables.filter((entry) => entry.rowCount > 0).length,
      ...normalizedExtraCounts,
    },
  };
}

export function assertSummariesMatch(source, restored, label) {
  if (
    source?.queryDigest !== restored?.queryDigest
    || JSON.stringify(canonical(source?.rowCounts)) !== JSON.stringify(canonical(restored?.rowCounts))
  ) {
    throw new Error(`${label}_source_restore_mismatch`);
  }
}

export function assertTenantRegistryCoverage(registryTables, runtimeTables) {
  const normalize = (values, label) => {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`${label}_invalid`);
    const result = values.map((value) => assertIdentifier(value, label)).sort();
    if (new Set(result).size !== result.length) throw new Error(`${label}_duplicate`);
    return result;
  };
  const expected = normalize(registryTables, "tenant_registry_tables");
  const actual = normalize(runtimeTables, "tenant_runtime_tables");
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("tenant_registry_runtime_drift");
  }
  return expected;
}

export function combinedBackupDigest(postgresDigest, redisDigest) {
  for (const [label, value] of [["postgres", postgresDigest], ["redis", redisDigest]]) {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`${label}_backup_digest_invalid`);
    }
  }
  return sha256Canonical({ postgresDigest, redisDigest });
}

export function assertFinancialInvariantCounts(counts) {
  const expected = FINANCIAL_INVARIANT_QUERIES.map((entry) => entry.name).sort();
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("financial_invariant_counts_invalid");
  }
  const actual = Object.keys(counts).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("financial_invariant_membership_invalid");
  }
  for (const [name, count] of Object.entries(counts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`${name}_financial_invariant_count_invalid`);
    }
    if (count !== 0) throw new Error(`${name}_financial_invariant_divergence`);
  }
  return counts;
}
