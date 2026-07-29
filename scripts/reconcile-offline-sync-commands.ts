import { withTx } from "../src/lib/db";
import {
  purgeExpiredOfflineCommands,
  reconcileStaleOfflineCommands,
} from "../src/lib/offline-sync-authority";

const result = await withTx(async (client) => {
  const reconciled = await reconcileStaleOfflineCommands(client, { limit: 250 });
  const purged = await purgeExpiredOfflineCommands(client, 1_000);
  return { ...reconciled, purged };
});

if (!result.enabled) {
  console.error("Offline command reconciliation failed: PostgreSQL is unavailable.");
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, ...result.value }));
