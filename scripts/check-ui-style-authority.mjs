import { readFile } from "node:fs/promises";

const files = {
  layout: "src/app/layout.tsx",
  globals: "src/app/globals.css",
  tokens: "src/app/tecpey-brand-tokens.css",
  landing: "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
  postcss: "postcss.config.mjs",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason} (${text})`);
};

requireText("layout", 'import "./globals.css";', "root layout must load global Tailwind CSS");
requireText("layout", 'import "./tecpey-brand-tokens.css";', "root layout must load governed TecPey design tokens");
requireText("globals", '@import "tailwindcss";', "Tailwind v4 entry import is required");
requireText("postcss", '"@tailwindcss/postcss"', "Tailwind PostCSS plugin is required");
requireText("landing", 'className="tecpey-enterprise', "active landing must expose the governed UI scope");

const consumedLandingTokens = [
  "--tp-bg",
  "--tp-surface",
  "--tp-card",
  "--tp-text",
  "--tp-muted",
  "--tp-primary",
  "--tp-border",
];

const governedTokens = [
  ...consumedLandingTokens,
  "--tp-focus",
  "--tp-success",
  "--tp-danger",
];

for (const token of consumedLandingTokens) {
  requireText("landing", `var(${token})`, `active landing must consume ${token}`);
}

for (const token of governedTokens) {
  const declarations = content.tokens.match(new RegExp(`${token.replaceAll("-", "\\-")}\\s*:`, "g")) ?? [];
  if (declarations.length < 2) {
    failures.push(`${files.tokens}: ${token} must be defined for both light and dark modes`);
  }
}

for (const required of [
  ".tecpey-enterprise",
  ":focus-visible",
  "background: var(--tp-bg)",
  "color: var(--tp-text)",
  "outline: 3px solid var(--tp-focus)",
]) {
  requireText("tokens", required, "TecPey rendered-surface contract is incomplete");
}

if (failures.length > 0) {
  console.error("Frontend style authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Frontend style authority check passed: Tailwind and TecPey tokens are globally governed.");
