import { publishRiskEnforcementOutbox } from "../src/lib/security/risk-enforcement-authority";

async function main(): Promise<void> {
  const principalId = process.argv[2]?.trim() || undefined;
  const published = await publishRiskEnforcementOutbox(principalId);
  if (!published) {
    throw new Error("risk_enforcement_projection_repair_incomplete");
  }
  console.log(
    principalId
      ? `Risk enforcement projection repaired for ${principalId}.`
      : "Risk enforcement projection repair completed.",
  );
}

main().catch((error) => {
  console.error(
    "Risk enforcement projection repair failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
