import { deleteExpiredCrmLeadPii } from "../src/lib/crm/lead-authority";

const limit = Math.max(1, Math.min(1000, Number(process.env.CRM_LEAD_RETENTION_BATCH ?? 250)));
const deleted = await deleteExpiredCrmLeadPii(limit);
console.log(JSON.stringify({ ok: true, deleted }));
