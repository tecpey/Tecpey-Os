import { randomUUID } from "node:crypto";
import { withTx } from "../src/lib/db";
import {
  claimCrmLeadDeliveries,
  deliverCrmLeadClaim,
  failCrmLeadClaim,
} from "../src/lib/crm/lead-authority";

const workerId = `crm-lead-${process.pid}-${randomUUID()}`;
const batchSize = Math.max(1, Math.min(50, Number(process.env.CRM_LEAD_WORKER_BATCH ?? 20)));

const claimed = await withTx((client) => claimCrmLeadDeliveries(client, workerId, batchSize));
if (!claimed.enabled) {
  console.error("CRM lead worker failed closed: PostgreSQL is unavailable.");
  process.exit(1);
}

let delivered = 0;
let failed = 0;
for (const claim of claimed.value) {
  try {
    await deliverCrmLeadClaim(claim, workerId);
    delivered += 1;
  } catch (error) {
    const code = error instanceof Error ? error.message : "crm_delivery_unknown";
    await failCrmLeadClaim(claim, workerId, code);
    failed += 1;
  }
}

console.log(JSON.stringify({ ok: failed === 0, workerId, claimed: claimed.value.length, delivered, failed }));
if (failed > 0) process.exitCode = 1;
