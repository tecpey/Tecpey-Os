import { reconcileMentorProfiles } from "../src/lib/mentor-profile-reconciliation";

async function main(): Promise<void> {
  const limitArg = Number.parseInt(process.argv[2] ?? "", 10);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined;

  const result = await reconcileMentorProfiles({ limit });
  if (!result.enabled) {
    throw new Error("mentor_profile_repair_database_unavailable");
  }
  if (result.failed > 0) {
    throw new Error(
      `mentor_profile_repair_incomplete: ${result.failed} of ${result.scanned} recomputes failed`,
    );
  }

  console.log(
    `Mentor profile repair completed. Scanned ${result.scanned}, recomputed ${result.repaired}.`,
  );
}

main().catch((error) => {
  console.error(
    "Mentor profile repair failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
