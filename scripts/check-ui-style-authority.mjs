import { readFile } from "node:fs/promises";

const files = {
  layout: "src/app/layout.tsx",
  globals: "src/app/globals.css",
  tokens: "src/app/tecpey-brand-tokens.css",
  landing: "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
  contentUi: "src/components/content/ContentUI.tsx",
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

const colorModeTokens = [
  ...consumedLandingTokens,
  "--tp-focus",
  "--tp-success",
  "--tp-danger",
  "--tp-primary-2",
];

const rootOnlyTokens = [
  "--tp-radius-control",
  "--tp-radius-card",
  "--tp-ease-out",
];

for (const token of consumedLandingTokens) {
  requireText("landing", `var(${token})`, `active landing must consume ${token}`);
}

for (const token of colorModeTokens) {
  const declarations = content.tokens.match(new RegExp(`${token.replaceAll("-", "\\-")}\\s*:`, "g")) ?? [];
  if (declarations.length < 2) {
    failures.push(`${files.tokens}: ${token} must be defined for both light and dark modes`);
  }
}

for (const token of rootOnlyTokens) {
  const declarations = content.tokens.match(new RegExp(`${token.replaceAll("-", "\\-")}\\s*:`, "g")) ?? [];
  if (declarations.length < 1) {
    failures.push(`${files.tokens}: ${token} must be defined by the governed root token contract`);
  }
}

for (const required of [
  ".tecpey-enterprise",
  ":focus-visible",
  "background: var(--tp-bg)",
  "color: var(--tp-text)",
  "outline: 3px solid var(--tp-focus)",
  ".tecpey-card",
  ".tecpey-kicker",
  ".tecpey-action-primary",
  ".tecpey-action-secondary",
  ".tecpey-action-ghost",
  ".tecpey-action-compact",
  ".tecpey-action-primary:active",
  "@media (hover: hover) and (pointer: fine)",
  "@media (prefers-reduced-motion: reduce)",
]) {
  requireText("tokens", required, "TecPey rendered-surface contract is incomplete");
}

for (const forbidden of [
  "--tp-bg:",
  "--tp-surface:",
  "--tp-card:",
  "--tp-text:",
  "--tp-muted:",
  "--tp-primary:",
  "--tp-border:",
]) {
  if (content.globals.includes(forbidden)) {
    failures.push(`${files.globals}: governed TecPey tokens must not be redeclared outside ${files.tokens} (${forbidden})`);
  }
}

for (const required of [
  "tecpey-enterprise",
  "tecpey-kicker",
  "tecpey-action-primary",
  "tecpey-action-secondary",
  "tecpey-card",
]) {
  requireText("contentUi", required, "shared public content UI must consume the governed TecPey design-system primitives");
}

if (failures.length > 0) {
  console.error("Frontend style authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Frontend style authority check passed: Tailwind, TecPey tokens and shared public UI primitives are globally governed.");
