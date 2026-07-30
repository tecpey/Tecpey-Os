import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/rules-of-hooks": "error",
      "@next/next/no-img-element": "error",
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
      "react-hooks/immutability": "error",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    ".kilo/**",
    "public/charting_library/**",
    "public/datafeeds/**",
    "public/vendor/**",
    "public/**/*.min.js",
    "docs/internal-qa/**",
    "docs/engineering/phase39/wallet-candidates/**",
  ]),
]);

export default eslintConfig;
