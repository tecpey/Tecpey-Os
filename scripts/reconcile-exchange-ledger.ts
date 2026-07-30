import {
  reconcileExchangeLedger,
} from "../src/lib/trading/exchange-reconciliation";

async function main(): Promise<void> {
  const report = await reconcileExchangeLedger();
  const asJson = process.argv.includes("--json");

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Exchange reconciliation (${report.policyVersion}) at ${report.generatedAt}`,
    );
    console.log(`Checks: ${report.checks.length}`);
    console.log(`Evidence digest: ${report.evidenceDigest}`);
    if (report.reconciled) {
      console.log(
        "Reconciled: every wallet balance, order fill, trade fee and terminal hold agrees with the immutable ledger.",
      );
    } else {
      console.error(`Unexplained deltas: ${report.deltaCount}`);
      for (const delta of report.deltas) {
        console.error(
          `- ${delta.code} ${delta.subject}: expected ${delta.expected}, observed ${delta.observed} (delta ${delta.delta})`,
        );
      }
    }
  }

  // A reconciliation that finds a delta is a successful *detection*, but the
  // command must still fail closed so an operator or pipeline cannot read it as
  // a clean result.
  if (!report.reconciled) process.exit(1);
}

main().catch((error) => {
  console.error(
    "Exchange reconciliation failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
