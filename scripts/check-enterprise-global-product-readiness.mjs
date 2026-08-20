import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_REGISTRY = "config/enterprise-global-product-readiness.json";
const REQUIRED_AUTHORITY = "enterprise-global-product-readiness-v1";
const REQUIRED_BENCHMARKS = new Set([
  "Binance Academy",
  "Coinbase Learn",
  "Coinbase Advanced",
  "TradingView",
  "Google Search AI optimization",
  "IndexNow and URL submission",
  "Binance Developer/API model",
]);

function fail(message) {
  throw new Error(`enterprise global product readiness invalid: ${message}`);
}

function percent(numerator, denominator) {
  return Math.round((numerator / denominator) * 1000) / 10;
}

function weightedPercent(categories) {
  const totalWeight = categories.reduce((sum, item) => sum + item.weight, 0);
  const weighted = categories.reduce((sum, item) => sum + item.currentPercent * item.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function uniqueValues(items, selector) {
  return new Set(items.map(selector));
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  return value;
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) fail(`${label} must be an integer`);
}

function assertHttpsUrl(value, label) {
  if (typeof value !== "string") fail(`${label} must be an https URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an https URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must be an https URL`);
}

export function validateEnterpriseGlobalProductReadiness(registry) {
  const failures = [];
  const collect = (fn) => {
    try {
      fn();
    } catch (error) {
      failures.push(error.message.replace(/^enterprise global product readiness invalid: /, ""));
    }
  };

  collect(() => {
    if (registry.schemaVersion !== 1) fail("schemaVersion must be 1");
    if (registry.authority !== REQUIRED_AUTHORITY) fail(`authority must be ${REQUIRED_AUTHORITY}`);
    if (registry.baseDate !== "2026-08-20") fail("baseDate must remain the 2026-08-20 audit baseline");
  });

  const launchScope = registry.launchScope ?? {};
  collect(() => assertHttpsUrl(launchScope.iranFirstDomain, "launchScope.iranFirstDomain"));
  collect(() => assertHttpsUrl(launchScope.globalNextDomain, "launchScope.globalNextDomain"));
  collect(() => {
    if (launchScope.iranFirstThenGlobal !== true) fail("Iran-first then .com-next strategy must be explicit");
    if (launchScope.currentDecision !== "NO_GO_PUBLIC_FINANCIAL_ENTERPRISE") {
      fail("currentDecision must not claim public/financial/enterprise GO while external blockers remain");
    }
    if (launchScope.financialActivation !== "DISABLED_UNTIL_INDEPENDENT_EVIDENCE") {
      fail("financialActivation must remain disabled until independent evidence closes");
    }
  });

  const floors = registry.readinessFloors ?? {};
  for (const [key, value] of Object.entries(floors)) collect(() => assertInteger(value, `readinessFloors.${key}`));

  const controls = assertArray(registry.controls, "controls");
  const controlIds = uniqueValues(controls, (control) => control.id);
  collect(() => {
    if (controlIds.size !== controls.length) fail("control ids must be unique");
    if (controls.length !== floors.minimumControlCount) {
      fail(`expected ${floors.minimumControlCount} controls, found ${controls.length}`);
    }
  });

  const evidenceReady = countBy(controls, (control) => control.status === "EVIDENCE_READY");
  const blockedExternal = countBy(controls, (control) => control.status === "BLOCKED_EXTERNAL");
  const controlEvidencePercent = percent(evidenceReady, controls.length);

  collect(() => {
    if (evidenceReady !== floors.requiredEvidenceReadyControls) {
      fail(`expected ${floors.requiredEvidenceReadyControls} EVIDENCE_READY controls, found ${evidenceReady}`);
    }
    if (blockedExternal !== floors.requiredBlockedExternalControls) {
      fail(`expected ${floors.requiredBlockedExternalControls} BLOCKED_EXTERNAL controls, found ${blockedExternal}`);
    }
    if (controlEvidencePercent < floors.controlEvidencePercent) {
      fail(`control evidence percent fell to ${controlEvidencePercent}% below floor ${floors.controlEvidencePercent}%`);
    }
  });

  for (const control of controls) {
    collect(() => {
      if (!/^([A-Z]+|QA|OPS)-[0-9]{3}$/.test(control.id)) fail(`${control.id} has an invalid control id`);
      if (!["P0", "P1", "P2"].includes(control.severity)) fail(`${control.id} has invalid severity`);
      if (!["EVIDENCE_READY", "BLOCKED_EXTERNAL"].includes(control.status)) fail(`${control.id} has invalid status`);
      if (control.status === "BLOCKED_EXTERNAL" && (control.severity !== "P0" || control.nextWave !== "A")) {
        fail(`${control.id} external blockers must be P0 wave A work`);
      }
    });
  }

  const categories = assertArray(registry.categoryReadiness, "categoryReadiness");
  const categoryIds = uniqueValues(categories, (category) => category.id);
  collect(() => {
    if (categoryIds.size !== categories.length) fail("category ids must be unique");
    if (categories.length < 15) fail("all 15 readiness categories from the audit must remain tracked");
  });

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  for (const [id, floorKey] of [
    ["global_dotcom_readiness", "globalReadinessPercent"],
  ]) {
    collect(() => {
      const category = categoryMap.get(id);
      if (!category) fail(`${id} category is required`);
      if (category.currentPercent < floors[floorKey]) {
        fail(`${id} fell to ${category.currentPercent}% below floor ${floors[floorKey]}%`);
      }
    });
  }

  for (const category of categories) {
    collect(() => {
      if (!Number.isInteger(category.currentPercent) || category.currentPercent < 0 || category.currentPercent > 100) {
        fail(`${category.id} currentPercent must be an integer from 0 to 100`);
      }
      if (!Number.isInteger(category.weight) || category.weight < 1) fail(`${category.id} must have a positive weight`);
    });
  }

  const benchmarkSources = new Set(assertArray(registry.benchmarkChecklist, "benchmarkChecklist").map((item) => item.source));
  for (const source of REQUIRED_BENCHMARKS) {
    collect(() => {
      if (!benchmarkSources.has(source)) fail(`benchmark source missing: ${source}`);
    });
  }

  const debtTotal = assertArray(registry.seoAeoGeoDebtQueue, "seoAeoGeoDebtQueue").reduce(
    (sum, item) => sum + item.remainingRoutes,
    0,
  );
  collect(() => {
    if (debtTotal !== floors.routeScopedJsonLdDebt) {
      fail(`route-scoped JSON-LD debt must total ${floors.routeScopedJsonLdDebt}, found ${debtTotal}`);
    }
  });

  const screenshotMatrix = registry.screenshotEvidenceMatrix ?? {};
  collect(() => {
    const viewportCount = assertArray(screenshotMatrix.viewports, "screenshotEvidenceMatrix.viewports").length;
    if (screenshotMatrix.routeCount * viewportCount !== screenshotMatrix.requiredSlots) {
      fail("screenshot slots must equal routeCount multiplied by viewport count");
    }
    if (screenshotMatrix.requiredSlots !== floors.requiredScreenshotSlots) {
      fail(`screenshot matrix must require ${floors.requiredScreenshotSlots} slots`);
    }
    if (screenshotMatrix.status !== "BLOCKED_EXTERNAL_UNTIL_BROWSER_CAPTURE") {
      fail("screenshot matrix must stay externally blocked until real browser capture exists");
    }
  });

  collect(() => {
    const outputs = assertArray(registry.contentWorkflowOutputs, "contentWorkflowOutputs");
    if (outputs.length !== 4) fail("content automation must produce exactly four governed outputs");
    for (const required of [
      "public_seo_aeo_geo_block",
      "product_graph_update",
      "education_snippet_quiz_flashcard_arena_exercise",
      "control_source_editorial_copyright_security_history",
    ]) {
      if (!outputs.includes(required)) fail(`content workflow output missing: ${required}`);
    }
  });

  const waveIds = new Set(assertArray(registry.operationalWaves, "operationalWaves").map((wave) => wave.id));
  for (const wave of ["A", "B", "C", "D"]) {
    collect(() => {
      if (!waveIds.has(wave)) fail(`operational wave missing: ${wave}`);
    });
  }

  collect(() => {
    const forbiddenClaims = assertArray(
      registry.forbiddenClaimsUntilEvidenceCloses,
      "forbiddenClaimsUntilEvidenceCloses",
    ).join("\n").toLowerCase();
    for (const phrase of ["public financial go", "enterprise go", "real-money exchange ready", "custody ready"]) {
      if (!forbiddenClaims.includes(phrase)) fail(`forbidden claim missing: ${phrase}`);
    }
  });

  if (failures.length > 0) fail(failures.join("; "));

  return {
    totalControls: controls.length,
    evidenceReadyControls: evidenceReady,
    blockedExternalControls: blockedExternal,
    controlEvidencePercent,
    weightedProductReadinessPercent: weightedPercent(categories),
    routeScopedJsonLdDebt: debtTotal,
    screenshotSlotsRequired: screenshotMatrix.requiredSlots,
    decision: launchScope.currentDecision,
  };
}

export async function readEnterpriseGlobalProductReadinessRegistry(file = DEFAULT_REGISTRY) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${file} could not be read as JSON: ${error.message}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--registry") fail(`unknown option: ${arg}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`${arg} requires a value`);
    args.set("registry", next);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const registry = await readEnterpriseGlobalProductReadinessRegistry(args.get("registry") ?? DEFAULT_REGISTRY);
  const summary = validateEnterpriseGlobalProductReadiness(registry);
  console.log(
    `Enterprise global product readiness check passed: ${summary.evidenceReadyControls}/${summary.totalControls} controls evidence-ready (${summary.controlEvidencePercent}%), ${summary.blockedExternalControls} external P0 blockers tracked, weighted readiness ${summary.weightedProductReadinessPercent}%, ${summary.routeScopedJsonLdDebt} route-scoped JSON-LD debt items and ${summary.screenshotSlotsRequired} screenshot slots remain governed.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
