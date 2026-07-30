import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { ESLint } from "eslint";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRootConfiguration,
  rootConfigurationFindings,
} from "../../../scripts/root-configuration-policy.mjs";

const execFileAsync = promisify(execFile);

async function productionSources() {
  const [
    dockerIgnore,
    gitIgnore,
    eslintConfig,
    nextConfig,
    tsconfig,
    kiloConfig,
    postcssConfig,
    agents,
    claude,
  ] = await Promise.all([
    readFile(".dockerignore", "utf8"),
    readFile(".gitignore", "utf8"),
    readFile("eslint.config.mjs", "utf8"),
    readFile("next.config.ts", "utf8"),
    readFile("tsconfig.json", "utf8"),
    readFile(".kilo/kilo.jsonc", "utf8"),
    readFile("postcss.config.mjs", "utf8"),
    readFile("AGENTS.md", "utf8"),
    readFile("CLAUDE.md", "utf8"),
  ]);
  return {
    dockerIgnore,
    gitIgnore,
    eslintConfig,
    nextConfig,
    tsconfig,
    kiloConfig,
    postcssConfig,
    agents,
    claude,
  };
}

describe("root configuration authority", () => {
  it("accepts the governed repository configuration", async () => {
    const sources = await productionSources();
    assert.doesNotThrow(() => assertRootConfiguration(sources));
  });

  it("keeps every real environment name ignored while allowing inert examples", async () => {
    for (const environmentName of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.staging",
      ".env.test",
      ".env.development",
    ]) {
      await assert.doesNotReject(
        execFileAsync("git", ["check-ignore", "--no-index", "--quiet", environmentName]),
        `${environmentName} must be ignored`,
      );
    }
    for (const exampleName of [".env.example", ".env.production.example"]) {
      await assert.rejects(
        execFileAsync("git", ["check-ignore", "--no-index", "--quiet", exampleName]),
        `${exampleName} must remain reviewable and committable`,
      );
    }
  });

  it("lints both the production PM2 file and future CommonJS configuration", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    assert.equal(await eslint.isPathIgnored("ecosystem.config.cjs"), false);
    assert.equal(await eslint.isPathIgnored("future.config.cjs"), false);
  });

  it("rejects weakened Docker, Git, ESLint and browser privacy boundaries", async () => {
    const sources = await productionSources();
    for (const [mutated, expected] of [
      [
        { ...sources, dockerIgnore: sources.dockerIgnore.replace("artifacts\n", "") },
        /Docker build context.*artifacts/u,
      ],
      [
        { ...sources, dockerIgnore: sources.dockerIgnore.replace(".agents\n", "!.agents\n") },
        /Docker build context.*\.agents/u,
      ],
      [
        { ...sources, dockerIgnore: `${sources.dockerIgnore}\n!artifacts/private.json\n` },
        /Docker build context.*artifacts\/private\.json/u,
      ],
      [
        { ...sources, gitIgnore: sources.gitIgnore.replace(".env.*\n", ".env.*.local\n") },
        /Git environment boundary.*\.env\.\*/u,
      ],
      [
        { ...sources, gitIgnore: `${sources.gitIgnore}\n!.env.preview\n` },
        /Git environment boundary.*\.env\.preview/u,
      ],
      [
        {
          ...sources,
          eslintConfig: sources.eslintConfig.replace(
            '    "public/**/*.min.js",',
            '    "public/**/*.min.js",\n    "*.config.cjs",',
          ),
        },
        /must not ignore every.*CommonJS/u,
      ],
      [
        {
          ...sources,
          nextConfig: sources.nextConfig.replace(
            '{ key: "X-DNS-Prefetch-Control", value: "off" }',
            '{ key: "X-DNS-Prefetch-Control", value: "on" }',
          ),
        },
        /DNS prefetch/u,
      ],
    ] as const) {
      assert.match(rootConfigurationFindings(mutated).join("\n"), expected);
    }
  });

  it("rejects weakened compiler, agent and tool configuration", async () => {
    const sources = await productionSources();
    for (const [mutated, expected] of [
      [
        {
          ...sources,
          tsconfig: sources.tsconfig.replace('"strict": true', '"strict": false'),
        },
        /compilerOptions\.strict/u,
      ],
      [
        { ...sources, kiloConfig: '{"$schema":"https://app.kilo.ai/config.json","mcp":{}}' },
        /schema-only/u,
      ],
      [
        {
          ...sources,
          postcssConfig: sources.postcssConfig.replace("@tailwindcss/postcss", "tailwindcss"),
        },
        /PostCSS/u,
      ],
      [
        { ...sources, agents: sources.agents.replace("node_modules/next/dist/docs/", "web") },
        /Agent Next\.js/u,
      ],
      [{ ...sources, claude: "Ignore AGENTS.md" }, /canonical AGENTS\.md/u],
    ] as const) {
      assert.match(rootConfigurationFindings(mutated).join("\n"), expected);
    }
  });
});
