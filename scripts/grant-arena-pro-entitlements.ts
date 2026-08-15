import { grantDueArenaProEntitlements } from "../src/lib/arena-league-entitlement-authority";

function boundedEnvInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

const result = await grantDueArenaProEntitlements({
  limit: boundedEnvInteger("ARENA_PRO_ENTITLEMENT_SNAPSHOT_LIMIT", 25, 1, 100),
});

console.log(JSON.stringify({ ok: true, ...result }));
