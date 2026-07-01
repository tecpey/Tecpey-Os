// Compliance provider bootstrap — Phase 36.
//
// Called from server.ts on startup. Registers available providers based on
// environment variables. Providers without API keys are skipped gracefully.
//
// The exchange core imports only the interfaces (compliance.ts), never the
// concrete adapters. This module is the only place where adapters are imported.

import { registerComplianceProviders } from "@/lib/security/compliance";
import { SumsubKycProvider } from "./sumsub";
import { ChainalysisAmlProvider } from "./chainalysis";
import { OfacSanctionsProvider } from "./ofac";
import { logger } from "@/lib/logger";

export function bootstrapComplianceProviders(): void {
  const providers: Parameters<typeof registerComplianceProviders>[0] = {};
  const active: string[] = [];

  // KYC: Sumsub
  if (process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY) {
    providers.kyc = new SumsubKycProvider();
    active.push("kyc:sumsub");
  }

  // AML: Chainalysis KYT
  if (process.env.CHAINALYSIS_API_KEY) {
    providers.aml = new ChainalysisAmlProvider();
    active.push("aml:chainalysis");
  }

  // Sanctions: OFAC (no API key required)
  providers.sanctions = new OfacSanctionsProvider();
  active.push("sanctions:ofac");

  // Travel Rule: no provider in Phase 36 (Notabene integration Phase 38)

  registerComplianceProviders(providers);

  if (active.length > 0) {
    logger.info("[compliance] providers registered", { active });
  } else {
    logger.info("[compliance] no external providers configured (sanctions:ofac active)");
  }
}
