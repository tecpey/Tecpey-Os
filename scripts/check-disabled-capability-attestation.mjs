import { readFile } from "node:fs/promises";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const files = [
  "README.md",
  "README.fa.md",
  "package.json",
  "server.ts",
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/validate-env.mjs",
  "src/app/layout.tsx",
  "src/app/en/page.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/components/seo/StructuredData.tsx",
  "src/lib/wallet/custody-launch-policy.ts",
];

const sources = Object.fromEntries(
  await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])),
);
const failures = evaluateDisabledCapabilityAttestation(sources);

if (failures.length > 0) {
  console.error("Disabled capability attestation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Disabled capability attestation passed: public copy, release packets, runtime boot and custody/withdrawal activation surfaces preserve the controlled-launch boundary.",
);
