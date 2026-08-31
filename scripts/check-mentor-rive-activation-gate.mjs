import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMentorRiveAcceptanceCheck } from "./check-mentor-rive-acceptance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTED_EVIDENCE =
  process.env.TECPEY_MENTOR_RIVE_ACCEPTANCE_EVIDENCE ||
  "docs/mentor/acceptance/accepted/tecpey-mentor-rive-acceptance.v1.json";

async function findRiveAssets(directory) {
  const found = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await findRiveAssets(fullPath)));
    if (entry.isFile() && entry.name.endsWith(".riv")) found.push(fullPath);
  }
  return found;
}

export async function evaluateActivationState(rootDir = ROOT) {
  const packageJson = JSON.parse(
    await readFile(path.join(rootDir, "package.json"), "utf8"),
  );
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const rivePackages = Object.keys(dependencies).filter((name) =>
    name.startsWith("@rive-app/"),
  );
  const riveAssets = await findRiveAssets(path.join(rootDir, "public"));
  const fallbackSource = await readFile(
    path.join(rootDir, "src/components/mentor/LivingMentorAvatar.tsx"),
    "utf8",
  );
  const errors = [];

  if (!fallbackSource.includes("tecpey-living-mentor-v1.webp")) {
    errors.push("The approved static fallback is missing from LivingMentorAvatar.");
  }
  if (fallbackSource.includes("@rive-app/")) {
    errors.push("The static fallback boundary imports the Rive runtime eagerly.");
  }

  const activationDetected = rivePackages.length > 0 || riveAssets.length > 0;
  if (!activationDetected) {
    return {
      ok: errors.length === 0,
      mode: "static_fallback",
      activationDetected: false,
      rivePackages,
      riveAssets: [],
      errors,
    };
  }

  if (!rivePackages.includes("@rive-app/react-webgl2")) {
    errors.push("Web activation requires @rive-app/react-webgl2.");
  }
  const unsupportedPackages = rivePackages.filter(
    (name) => name !== "@rive-app/react-webgl2",
  );
  if (unsupportedPackages.length > 0) {
    errors.push(`Unsupported Rive web packages: ${unsupportedPackages.join(", ")}.`);
  }
  if (riveAssets.length !== 1) {
    errors.push("Activation requires exactly one canonical .riv asset in public/.");
  }

  try {
    const acceptance = await runMentorRiveAcceptanceCheck({
      evidencePath: ACCEPTED_EVIDENCE,
      rootDir,
    });
    if (!acceptance.ok) errors.push(...acceptance.errors);
    if (
      riveAssets.length === 1 &&
      acceptance.evidencePath &&
      !acceptance.errors.length
    ) {
      const evidence = JSON.parse(
        await readFile(path.join(rootDir, acceptance.evidencePath), "utf8"),
      );
      const activatedAsset = path.relative(rootDir, riveAssets[0]);
      if (evidence.asset?.path !== activatedAsset) {
        errors.push("Accepted evidence does not name the activated .riv asset.");
      }
    }
  } catch (error) {
    errors.push(
      error?.code === "ENOENT"
        ? `Accepted evidence is missing: ${ACCEPTED_EVIDENCE}.`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }

  return {
    ok: errors.length === 0,
    mode: errors.length === 0 ? "rive" : "blocked",
    activationDetected: true,
    rivePackages,
    riveAssets: riveAssets.map((file) => path.relative(rootDir, file)),
    errors,
  };
}

async function runCli() {
  const result = await evaluateActivationState();
  if (result.ok) {
    console.log(
      result.mode === "rive"
        ? "Rive Mentor activation gate: ACCEPTED"
        : "Rive Mentor activation gate: SAFE STATIC FALLBACK",
    );
  } else {
    console.error("Rive Mentor activation gate: BLOCKED");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runCli();
