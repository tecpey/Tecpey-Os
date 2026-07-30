import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertContributionGovernance,
  contributionGovernanceFindings,
} from "../../../scripts/contribution-governance-policy.mjs";

const execFileAsync = promisify(execFile);

async function productionSources() {
  const paths = [
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "LICENSE",
  ] as const;
  const [
    bugReport,
    featureRequest,
    pullRequestTemplate,
    codeOfConduct,
    contributing,
    license,
  ] = await Promise.all(paths.map((repositoryPath) => readFile(repositoryPath, "utf8")));
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    encoding: "buffer",
  });
  return {
    bugReport,
    featureRequest,
    pullRequestTemplate,
    codeOfConduct,
    contributing,
    license,
    repositoryPaths: stdout.toString("utf8").split("\0").filter(Boolean),
  };
}

describe("contribution governance authority", () => {
  it("accepts the governed contribution and reporting surfaces", async () => {
    const sources = await productionSources();
    assert.doesNotThrow(() => assertContributionGovernance(sources));
  });

  it("rejects a missing security link and superseded roadmap", async () => {
    const sources = await productionSources();
    assert.match(
      contributionGovernanceFindings({
        ...sources,
        bugReport: sources.bugReport.replace("../../SECURITY.md", "../../MISSING_SECURITY.md"),
        featureRequest: sources.featureRequest.replace(
          "../../docs/MASTER_ROADMAP_v3.md",
          "../../docs/Roadmap.md",
        ),
      }).join("\n"),
      /Bug report security boundary[\s\S]*superseded roadmap[\s\S]*missing local link target/u,
    );
  });

  it("rejects an incomplete mutating-operation checklist", async () => {
    const sources = await productionSources();
    assert.match(
      contributionGovernanceFindings({
        ...sources,
        pullRequestTemplate: sources.pullRequestTemplate.replace("/`PUT`", ""),
        contributing: sources.contributing.replace(", `PUT`", ""),
      }).join("\n"),
      /Pull request mutating-operation checklist[\s\S]*PUT[\s\S]*Contributor mutating-operation contract[\s\S]*PUT/u,
    );
  });

  it("rejects stale setup and missing quality or API gates", async () => {
    const sources = await productionSources();
    assert.match(
      contributionGovernanceFindings({
        ...sources,
        pullRequestTemplate: sources.pullRequestTemplate.replace("`npm run check`", "`npm run lint`"),
        contributing: sources.contributing
          .replace(
            "npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund",
            "npm install",
          )
          .replace(".env.production.example", ".env.local.example"),
      }).join("\n"),
      /Pull request gate[\s\S]*npm run check[\s\S]*nonexistent \.env\.local\.example[\s\S]*lockfile-backed npm ci/u,
    );
  });

  it("rejects weakened reporting and proprietary-license boundaries", async () => {
    const sources = await productionSources();
    assert.match(
      contributionGovernanceFindings({
        ...sources,
        codeOfConduct: sources.codeOfConduct.replace(
          "All reports are treated with confidentiality",
          "Reports may be published",
        ),
        license: sources.license.replace("All rights reserved", "Some rights reserved"),
      }).join("\n"),
      /Code of Conduct reporting[\s\S]*confidentiality[\s\S]*Proprietary license[\s\S]*All rights reserved/u,
    );
  });

  it("rejects required governance text hidden inside Markdown comments", async () => {
    const sources = await productionSources();
    assert.match(
      contributionGovernanceFindings({
        ...sources,
        bugReport: sources.bugReport.replace(
          "Security vulnerabilities must NOT be reported here",
          "<!-- Security vulnerabilities must NOT be reported here -->",
        ),
        pullRequestTemplate: sources.pullRequestTemplate.replace(
          "`npm run api:security:check`",
          "<!-- `npm run api:security:check` -->",
        ),
        contributing: sources.contributing.replace(
          "Do **not** open a public issue",
          "<!-- Do **not** open a public issue -->",
        ),
        codeOfConduct: sources.codeOfConduct.replace(
          "All reports are treated with confidentiality",
          "<!-- All reports are treated with confidentiality -->",
        ),
        license: sources.license.replace(
          "All rights reserved",
          "<!-- All rights reserved -->",
        ),
      }).join("\n"),
      /Bug report security boundary[\s\S]*Pull request gate[\s\S]*Contributor contract[\s\S]*Code of Conduct reporting[\s\S]*Proprietary license/u,
    );
  });
});
