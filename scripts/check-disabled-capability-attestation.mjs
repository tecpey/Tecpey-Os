import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const REQUIRED_FILES = [
  "README.md",
  "README.fa.md",
  "package.json",
  "server.ts",
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/validate-env.mjs",
  "src/data/exchangeCompare.json",
  "src/app/layout.tsx",
  "src/app/en/page.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/components/seo/StructuredData.tsx",
  "src/lib/feature-flags.ts",
  "src/lib/wallet/custody-launch-policy.ts",
];

async function collectPublicSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (file === "src/app/api") continue;
      files.push(...(await collectPublicSourceFiles(file)));
    } else if (/\.(?:ts|tsx|mdx)$/.test(file)) {
      files.push(file);
    }
  }

  return files;
}

async function collectI18nMessageFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.json$/.test(entry.name))
    .map((entry) => `${root}/${entry.name}`);
}

const files = [
  ...new Set([
    ...REQUIRED_FILES,
    ...(await collectPublicSourceFiles("src/app")),
    ...(await collectPublicSourceFiles("src/components")),
    ...(await collectI18nMessageFiles("src/i18n/messages")),
  ]),
].sort();

const sources = Object.fromEntries(
  await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])),
);
const failures = evaluateDisabledCapabilityAttestation(sources);

if (failures.length > 0) {
  console.error("Disabled capability attestation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Disabled capability attestation passed: public copy, i18n messages, release packets, runtime boot and custody/withdrawal activation surfaces preserve the controlled-launch boundary.",
);
