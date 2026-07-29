import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
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
    "*.config.cjs",
  ]),
]);

export default eslintConfig;
