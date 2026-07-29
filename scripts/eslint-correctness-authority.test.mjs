import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";
import {
  compareBaseline,
  hasGovernedInlineException,
  invalidInlineExceptionLines,
  runAuthorityCheck,
  unreviewedBaselineKeys,
} from "./check-eslint-correctness-authority.mjs";

test("conditional hook calls fail the governed production config", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    `
      import { useState } from "react";
      export function InvalidHook({ enabled }: { enabled: boolean }) {
        if (!enabled) return null;
        const [value] = useState(0);
        return <span>{value}</span>;
      }
    `,
    { filePath: "src/__lint_fixtures__/invalid-hook.tsx" },
  );
  assert.ok(result.messages.some((message) =>
    message.ruleId === "react-hooks/rules-of-hooks" && message.severity === 2));
});

test("new explicit any fails the governed production config", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    "export function invalidBoundary(value: any) { return value; }",
    { filePath: "src/__lint_fixtures__/invalid-any.ts" },
  );
  assert.ok(result.messages.some((message) =>
    message.ruleId === "@typescript-eslint/no-explicit-any" && message.severity === 2));
});

test("inline exceptions require an issue-linked reason", () => {
  assert.equal(
    hasGovernedInlineException(
      "// eslint-disable-next-line react-hooks/exhaustive-deps",
    ),
    false,
  );
  assert.equal(
    hasGovernedInlineException(
      "// eslint-disable-next-line react-hooks/exhaustive-deps -- #162: mount-only hydration",
    ),
    true,
  );
  for (const governedRule of [
    "@typescript-eslint/no-explicit-any",
    "react-hooks/immutability",
    "react-hooks/purity",
    "react-hooks/refs",
    "react-hooks/rules-of-hooks",
    "react-hooks/set-state-in-effect",
  ]) {
    assert.equal(
      hasGovernedInlineException(
        `// eslint-disable-next-line ${governedRule} -- #999: attempted governed bypass`,
      ),
      false,
      `${governedRule} must remain unsuppressible`,
    );
  }
  assert.equal(
    hasGovernedInlineException(
      "/* eslint-disable react-hooks/rules-of-hooks -- #162: broad file bypass */",
    ),
    false,
  );
  assert.equal(
    hasGovernedInlineException(
      "eslint @typescript-eslint/no-explicit-any: off",
    ),
    false,
  );
  assert.equal(
    hasGovernedInlineException(
      "// eslint-disable-next-line react-hooks/refs, react-hooks/purity -- #162: broad rule bypass",
    ),
    false,
  );
  assert.deepEqual(
    invalidInlineExceptionLines(
      "const value: unknown = input; // eslint-disable-line @typescript-eslint/no-explicit-any",
    ),
    [1],
  );
  assert.deepEqual(
    invalidInlineExceptionLines(
      'const example = "// eslint-disable-line @typescript-eslint/no-explicit-any";',
    ),
    [],
  );
});

test("ESLint-driven authority includes root production entrypoints", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const results = await eslint.lintFiles(["."]);
  const lintedPaths = new Set(results.map((result) => path.resolve(result.filePath)));
  assert.ok(lintedPaths.has(path.resolve("server.ts")));
  assert.ok(lintedPaths.has(path.resolve("next.config.ts")));
});

test("baseline comparison rejects growth or line drift", () => {
  const expected = [{
    rule: "react-hooks/set-state-in-effect",
    path: "src/example.tsx",
    line: 10,
    column: 5,
  }];
  assert.equal(compareBaseline(expected, expected).matches, true);
  assert.equal(compareBaseline(expected, [...expected, {
    ...expected[0],
    line: 11,
  }]).matches, false);
  assert.deepEqual(unreviewedBaselineKeys([{
    rule: "react-hooks/set-state-in-effect",
    path: "src/components/ThemeToggle.tsx",
    line: 15,
    column: 5,
  }]), []);
  assert.deepEqual(unreviewedBaselineKeys([{
    rule: "react-hooks/set-state-in-effect",
    path: "src/new-debt.tsx",
    line: 1,
    column: 1,
  }]), [
    "react-hooks/set-state-in-effect:src/new-debt.tsx:1:1",
  ]);
});

test("repository correctness authority is internally consistent", async () => {
  await runAuthorityCheck();
});
