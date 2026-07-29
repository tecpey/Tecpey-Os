import fs from "node:fs";
import { assertProductionHostSupplyChain } from "./production-host-supply-chain-policy.mjs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const reject = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};

const dockerfile = read("Dockerfile");
const nextConfig = read("next.config.ts");
const dockerignore = read(".dockerignore");
const compose = read("docker-compose.production.yml");
const pkg = read("package.json");
const server = read("server.ts");
const health = read("src/app/api/health/route.ts");
const containerWorkflow = read(".github/workflows/container-supply-chain.yml");
const deploymentDoc = read("docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md");
const recovery = read("scripts/test-container-volume-recovery.sh");
const rollback = read("scripts/test-container-image-rollback.sh");
const systemdService = read("deploy/systemd/tecpey-web.service");
const hostBaseInstaller = read("scripts/ubuntu24-install-base.sh");
const pm2Deploy = read("scripts/ubuntu24-deploy-pm2.sh");
const hostPreflight = read("scripts/ubuntu24-preflight.sh");
const productionVerification = read("VERIFY_PRODUCTION.sh");
const activeDeploymentDocs = [
  ["Ubuntu quick deployment guide", read("DEPLOY_UBUNTU_24.md")],
  ["Ubuntu production deployment guide", read("DEPLOY_UBUNTU_24_PRODUCTION.md")],
  ["Deployment entry point", read("docs/Deployment.md")],
];
const workflows = fs.readdirSync(".github/workflows")
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => [name, read(`.github/workflows/${name}`)]);

requireText(dockerfile, "@sha256:", "Docker base image must be digest-pinned");
reject(dockerfile, /^ARG\s+.*IMAGE/m, "Docker base-image authority must not be build-argument overridable");
requireText(dockerfile, "npm ci --omit=dev", "runtime dependencies must exclude dev dependencies");
requireText(dockerfile, 'CMD ["node", "dist/run-production-bootstrap.cjs", "server"]', "runtime must execute the compiled production bootstrap");
reject(dockerfile, /COPY --from=builder \/app\/node_modules/, "runtime must not copy builder dependencies");
reject(dockerfile, /CMD \[[^\n]*tsx/, "runtime must not execute TypeScript");
requireText(dockerfile, "/usr/local/lib/node_modules/npm", "runtime must remove unused npm tooling");
requireText(dockerfile, "USER nextjs", "runtime must be rootless");
requireText(dockerfile, "HEALTHCHECK", "runtime image must declare readiness health check");
requireText(dockerfile, 'VOLUME ["/app/storage", "/app/.next/cache"]', "runtime writable paths must be explicit");
for (const excluded of [".git", ".env.*", "node_modules", ".next", "dist"]) {
  requireText(dockerignore, excluded, `Docker build context must exclude ${excluded}`);
}
for (const contract of [
  "ARG TECPEY_BUILD_COMMIT_SHA",
  "ENV TECPEY_BUILD_COMMIT_SHA=$TECPEY_BUILD_COMMIT_SHA",
  "grep -Eq '^[0-9a-f]{40}$'",
]) {
  requireText(dockerfile, contract, `Docker build identity contract missing: ${contract}`);
}
requireText(
  nextConfig,
  "TECPEY_IMMUTABLE_BUILD_COMMIT_SHA: immutableBuildCommit",
  "Next build must bake the exact immutable commit into compiled artifacts",
);
requireText(
  health,
  'commit: process.env.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA ?? "unknown"',
  "Health must report only the artifact-baked commit",
);
reject(
  health,
  /NEXT_PUBLIC_GIT_COMMIT/,
  "Health must not trust a runtime-overridable public Git commit",
);
for (const contract of [
  "TECPEY_BUILD_COMMIT_SHA=${{ github.event.pull_request.head.sha || github.sha }}",
  'TECPEY_BUILD_COMMIT_SHA=$CANDIDATE_SHA',
  'TECPEY_BUILD_COMMIT_SHA=$PREVIOUS_SHA',
  "TECPEY_BUILD_COMMIT_SHA=${{ github.sha }}",
]) {
  requireText(
    containerWorkflow,
    contract,
    `Container workflow must bind every build to an exact commit: ${contract}`,
  );
}

for (const variable of ["POSTGRES_PASSWORD", "REDIS_PASSWORD", "TECPEY_IMAGE_DIGEST"]) {
  requireText(compose, `\${${variable}:?`, `Compose must fail when ${variable} is absent`);
}
for (const contract of [
  "service_completed_successfully",
  "condition: service_healthy",
  "internal: true",
  "cap_drop: [ALL]",
  '"no-new-privileges:true"',
  "read_only: true",
  "--requirepass",
  "user: postgres",
  "user: redis",
]) {
  requireText(compose, contract, `Compose production contract missing: ${contract}`);
}
reject(compose, /change_me_strong_password/i, "Compose must not contain a literal production password");
reject(compose, /(?:DATABASE_URL|REDIS_URL):[^\n]*\$\{(?:POSTGRES|REDIS)_PASSWORD/, "Compose must not interpolate raw credentials into connection URLs");
reject(compose, /image:\s+[^\n@]+\s*$/m, "Compose service images must be digest-pinned");

requireText(pkg, '"start": "NODE_ENV=production node dist/run-production-bootstrap.cjs server"', "production start must use compiled connection bootstrap");
reject(pkg, /"build:server"[^\n]*--sourcemap/, "production server build must not retain source maps");
try {
  assertProductionHostSupplyChain({
    baseInstaller: hostBaseInstaller,
    pm2Deploy,
    preflight: hostPreflight,
    productionVerification,
    buildConfig: nextConfig,
    healthRoute: health,
    dockerfile,
    containerWorkflow,
    deploymentDocs: activeDeploymentDocs,
  });
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}
requireText(server, "drainRuntime", "server termination must use the bounded drain contract");
requireText(health, "runtime.requiredWorkers", "readiness must include required worker state");
requireText(health, 'runtime.phase !== "ready"', "readiness must reject non-ready runtime phases");
requireText(health, 'get("probe") === "live"', "an explicit process-liveness probe is required");
requireText(health, 'status: "alive"', "liveness must report only process state");
for (const contract of [
  "ExecStart=/usr/bin/npm run start",
  "KillSignal=SIGTERM",
  "TimeoutStopSec=20",
  "User=www-data",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
  "ReadWritePaths=/var/www/tecpey/storage /var/www/tecpey/.next/cache",
]) {
  requireText(systemdService, contract, `systemd production contract missing: ${contract}`);
}
requireText(deploymentDoc, "persistent-volume restore", "deployment documentation must define restore evidence");
for (const evidence of ["pg_dump", "pg_restore", "redis.rdb", "backup-digests.sha256"]) {
  requireText(recovery, evidence, `recovery drill must retain ${evidence} evidence`);
}
for (const evidence of ["CANDIDATE_ID", "PREVIOUS_ID", "previous-release-served"]) {
  requireText(rollback, evidence, `rollback drill must retain ${evidence} evidence`);
}

for (const [name, workflow] of workflows) {
  requireText(workflow, "permissions:", `${name} must declare workflow permissions`);
  reject(workflow, /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?![0-9a-f]{40}\b)/, `${name} contains a mutable external Action reference`);
  reject(workflow, /image:\s+(?:redis|postgres):[^@\n]+$/m, `${name} contains a mutable service image`);
  if (workflow.includes("actions/checkout@")) {
    requireText(workflow, "persist-credentials: false", `${name} checkout must not persist credentials`);
    requireText(workflow, "git rev-parse HEAD", `${name} must assert its exact checkout`);
  }
}

if (failures.length) {
  console.error("Production supply-chain authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Production supply-chain authority check passed.");
