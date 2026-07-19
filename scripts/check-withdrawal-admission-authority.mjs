import { readFile } from "node:fs/promises";

const routePath = "src/app/api/auth/withdraw/route.ts";
const route = await readFile(routePath, "utf8");
const failures = [];

const requireText = (text, reason) => {
  if (!route.includes(text)) failures.push(reason);
};
const rejectText = (text, reason) => {
  if (route.includes(text)) failures.push(reason);
};

requireText(
  "const WITHDRAWAL_ADMISSION_READY = false as const",
  "withdrawal admission must remain code-disabled until server authorities exist",
);
requireText(
  "withdrawal_admission_unavailable",
  "disabled admission must return an explicit unavailable response",
);
requireText(
  "authoritative_pricing",
  "the gate must name server-owned pricing as a required authority",
);
requireText(
  "one_time_2fa_authorization",
  "the gate must require one-time server-owned 2FA authorization",
);
requireText(
  "transactional_balance_reservation",
  "the gate must require transactional fund reservation",
);
requireText(
  "fail_closed_compliance",
  "the gate must require fail-closed compliance evidence",
);
requireText(
  "strictRevocation: true",
  "withdrawal routes must use strict session revocation",
);
rejectText(
  "body.amountUsd",
  "browser-supplied USD valuation is forbidden",
);
rejectText(
  "body.twoFaVerified",
  "browser-supplied 2FA truth is forbidden",
);
rejectText(
  "createWithdrawalRequest({",
  "the unsafe withdrawal service must not be reachable before authority cutover",
);

if (failures.length) {
  console.error(
    "Withdrawal admission authority check failed:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "Withdrawal admission authority check passed: client risk facts are rejected and admission remains fail-closed pending server-owned pricing, 2FA, idempotency, reservation and compliance authority.",
);
