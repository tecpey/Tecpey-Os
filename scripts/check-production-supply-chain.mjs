import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const reject = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};

const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const compose = read("docker-compose.production.yml");
const pkg = read("package.json");
const server = read("server.ts");
const health = read("src/app/api/health/route.ts");
const deploymentDoc = read("docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md");
const recovery = read("scripts/test-container-volume-recovery.sh");
const systemdService = read("deploy/systemd/tecpey-web.service");
const pm2Config = read("ecosystem.config.cjs");
const pm2Deploy = read("scripts/ubuntu24-deploy-pm2.sh");
const workflows = fs.readdirSync(".github/workflows")
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => [name, read(`.github/workflows/${name}`)]);

requireText(dockerfile, "@sha256:", "Docker base image must be digest-pinned");
reject(dockerfile, /^ARG\s+.*IMAGE/m, "Docker base-image authority must not be build-argument overridable");
requireText(dockerfile, "npm ci --omit=dev", "runtime dependencies must exclude dev dependencies");
requireText(dockerfile, 'CMD ["node", "dist/server.cjs"]', "runtime must execute the compiled server");
reject(dockerfile, /COPY --from=builder \/app\/node_modules/, "runtime must not copy builder dependencies");
reject(dockerfile, /CMD \[[^\n]*tsx/, "runtime must not execute TypeScript");
requireText(dockerfile, "/usr/local/lib/node_modules/npm", "runtime must remove unused npm tooling");
requireText(dockerfile, "USER nextjs", "runtime must be rootless");
requireText(dockerfile, "HEALTHCHECK", "runtime image must declare readiness health check");
requireText(dockerfile, 'VOLUME ["/app/storage", "/app/.next/cache"]', "runtime writable paths must be explicit");
for (const excluded of [".git", ".env.*", "node_modules", ".next", "dist"]) {
  requireText(dockerignore, excluded, `Docker build context must exclude ${excluded}`);
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
reject(compose, /image:\s+[^\n@]+\s*$/m, "Compose service images must be digest-pinned");

requireText(pkg, '"start": "NODE_ENV=production node dist/server.cjs"', "production start must use compiled server");
reject(pkg, /"build:server"[^\n]*--sourcemap/, "production server build must not retain source maps");
requireText(pm2Config, "script: 'dist/server.cjs'", "PM2 must execute the compiled server");
requireText(pm2Config, "interpreter: 'node'", "PM2 must not require TypeScript tooling");
reject(pm2Config, /\btsx\b|server\.ts/, "PM2 must not execute TypeScript in production");
requireText(pm2Deploy, "npm prune --omit=dev", "host deployment must remove development dependencies after build");
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
