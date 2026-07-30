import path from "node:path";

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function renderedMarkdownSource(source) {
  if (typeof source !== "string") return "";
  const rendered = [];
  let commentOpen = false;
  let fence = null;

  for (const line of source.split(/\r?\n/u)) {
    if (!commentOpen) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
      if (fenceMatch) {
        if (fence === null) fence = fenceMatch[1];
        else if (
          fenceMatch[1][0] === fence[0] &&
          fenceMatch[1].length >= fence.length
        ) {
          fence = null;
        }
        rendered.push(line);
        continue;
      }
      if (fence !== null) {
        rendered.push(line);
        continue;
      }
    }

    let visible = "";
    let cursor = 0;
    while (cursor < line.length) {
      if (commentOpen) {
        const end = line.indexOf("-->", cursor);
        if (end < 0) {
          cursor = line.length;
          continue;
        }
        commentOpen = false;
        cursor = end + 3;
        continue;
      }
      const start = line.indexOf("<!--", cursor);
      if (start < 0) {
        visible += line.slice(cursor);
        cursor = line.length;
        continue;
      }
      visible += line.slice(cursor, start);
      commentOpen = true;
      cursor = start + 4;
    }
    rendered.push(visible);
  }

  return rendered.join("\n");
}

function requireText(findings, source, required, label) {
  if (!renderedMarkdownSource(source).includes(required)) {
    findings.push(`${label} must retain ${required}`);
  }
}

function localMarkdownTargets(source) {
  return [...renderedMarkdownSource(source).matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
    .map((match) => match[1].trim())
    .filter(
      (target) =>
        target.length > 0 &&
        !target.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(target),
    );
}

function checkLocalLinks(findings, repositoryPaths, documentPath, source) {
  for (const target of localMarkdownTargets(source)) {
    const withoutFragment = target.split("#", 1)[0];
    if (!withoutFragment) continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(documentPath), withoutFragment),
    );
    if (resolved.startsWith("../") || resolved === ".." || !repositoryPaths.has(resolved)) {
      findings.push(`${documentPath} contains a missing local link target: ${target}`);
    }
  }
}

export function contributionGovernanceFindings(sources) {
  const findings = [];
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    return ["contribution governance sources must be an object"];
  }

  const repositoryPaths = new Set(
    Array.isArray(sources.repositoryPaths)
      ? sources.repositoryPaths.filter((entry) => typeof entry === "string")
      : [],
  );
  if (repositoryPaths.size === 0) {
    findings.push("contribution governance must receive the tracked repository paths");
  }

  requireText(
    findings,
    sources.bugReport,
    "[SECURITY.md](../../SECURITY.md)",
    "Bug report security boundary",
  );
  requireText(
    findings,
    sources.bugReport,
    "Security vulnerabilities must NOT be reported here",
    "Bug report security boundary",
  );

  requireText(
    findings,
    sources.featureRequest,
    "../../docs/MASTER_ROADMAP_v3.md",
    "Feature request roadmap authority",
  );
  if (renderedMarkdownSource(sources.featureRequest).includes("../../docs/Roadmap.md")) {
    findings.push("Feature requests must not direct contributors to the superseded roadmap");
  }

  for (const method of MUTATING_METHODS) {
    requireText(
      findings,
      sources.pullRequestTemplate,
      `\`${method}\``,
      "Pull request mutating-operation checklist",
    );
    requireText(
      findings,
      sources.contributing,
      `\`${method}\``,
      "Contributor mutating-operation contract",
    );
  }
  for (const required of [
    "`npm run check`",
    "`npm run api:security:check`",
    "same-origin CSRF evidence",
    "No secrets or API keys committed",
  ]) {
    requireText(findings, sources.pullRequestTemplate, required, "Pull request gate");
  }

  for (const required of [
    "npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund",
    "npm run check",
    "npm test",
    "npm run build",
    ".env.production.example",
    "DEPLOY_UBUNTU_24_PRODUCTION.md",
    "Never push directly to `main`",
    "Do **not** open a public issue",
  ]) {
    requireText(findings, sources.contributing, required, "Contributor contract");
  }
  const renderedContributing = renderedMarkdownSource(sources.contributing);
  if (renderedContributing.includes(".env.local.example")) {
    findings.push("Contributor setup must not reference the nonexistent .env.local.example");
  }
  if (renderedContributing.includes("\nnpm install\n")) {
    findings.push("Contributor setup must use the lockfile-backed npm ci install");
  }

  for (const required of [
    "## Reporting",
    "info@tecpey.ir",
    "All reports are treated with confidentiality",
  ]) {
    requireText(findings, sources.codeOfConduct, required, "Code of Conduct reporting");
  }
  for (const required of [
    "PROPRIETARY LICENSE",
    "All rights reserved",
    "express written",
    "info@tecpey.ir",
  ]) {
    requireText(findings, sources.license, required, "Proprietary license");
  }

  for (const [documentPath, source] of [
    [".github/ISSUE_TEMPLATE/bug_report.md", sources.bugReport],
    [".github/ISSUE_TEMPLATE/feature_request.md", sources.featureRequest],
    [".github/PULL_REQUEST_TEMPLATE.md", sources.pullRequestTemplate],
    ["CONTRIBUTING.md", sources.contributing],
  ]) {
    checkLocalLinks(findings, repositoryPaths, documentPath, source);
  }

  return findings;
}

export function assertContributionGovernance(sources) {
  const findings = contributionGovernanceFindings(sources);
  if (findings.length > 0) {
    throw new Error(`Contribution governance failed:\n- ${findings.join("\n- ")}`);
  }
}
