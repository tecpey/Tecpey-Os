import { assignDueDailyRepairChallenges } from "../src/lib/academy-daily-repair-challenge-authority";

function boundedEnvInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

function envDate(name: string): Date | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  return new Date(`${raw}T00:00:00.000Z`);
}

const result = await assignDueDailyRepairChallenges({
  limit: boundedEnvInteger("ACADEMY_DAILY_REPAIR_LIMIT", 100, 1, 500),
  challengeDate: envDate("ACADEMY_DAILY_REPAIR_DATE"),
});

console.log(JSON.stringify({ ok: true, ...result }));
