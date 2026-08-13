// Declared scope of every Command Center summary metric (audit finding F-1).
//
// The admin operator now carries a tenant (migration 0069), so admin reads that
// CAN be scoped are scoped. Several cannot be yet: academy_students,
// notification_center, academy_certificates and mentor_challenge_attempts have
// no tenant column at all, and academy_students is the academy root with 43
// tables pointing at it, so giving it a tenant boundary is its own program.
//
// Rather than let those numbers imply a boundary that is not enforced, each
// metric declares the scope it actually has. A tenant operator reading
// `scope: "platform"` knows the figure counts every tenant; a dashboard can
// label or withhold it. Silently mixing the two is how an admin plane starts
// lying about whose data it is showing.
//
// The declaration lives here rather than in the route module so a test can bind
// to it directly and check it against the real database: a metric may only be
// labelled "platform" while its source table genuinely has no tenant column.
// The moment that table gains one, the label becomes a lie and the guard in
// src/tests/security/admin-tenant-binding-cross-tenant-isolation-postgres.test.ts
// fails until the metric is actually scoped.

export type MetricScope = "tenant" | "platform";

export type CommandCenterMetric = Readonly<{
  /** Table the metric aggregates, as it must appear in information_schema. */
  table: string;
  scope: MetricScope;
}>;

export const COMMAND_CENTER_METRICS = Object.freeze({
  students: Object.freeze({ table: "academy_students", scope: "platform" }),
  events: Object.freeze({ table: "learning_events", scope: "tenant" }),
  notifications: Object.freeze({ table: "notification_center", scope: "platform" }),
  certificates: Object.freeze({ table: "academy_certificates", scope: "platform" }),
  challenges: Object.freeze({ table: "mentor_challenge_attempts", scope: "platform" }),
}) satisfies Readonly<Record<string, CommandCenterMetric>>;

export type CommandCenterMetricName = keyof typeof COMMAND_CENTER_METRICS;

/** The scope labels alone, as returned to the admin client. */
export const COMMAND_CENTER_METRIC_SCOPES: Readonly<
  Record<CommandCenterMetricName, MetricScope>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMAND_CENTER_METRICS).map(([name, metric]) => [name, metric.scope]),
  ) as Record<CommandCenterMetricName, MetricScope>,
);
