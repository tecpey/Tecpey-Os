import { after, before } from "node:test";

// Route tests that POST with an Origin header run through verifyCsrfOrigin,
// which compares that Origin against NEXT_PUBLIC_SITE_URL. Reading that from
// the ambient environment makes a security assertion depend on whichever
// variables the CI job happens to export, and it used to hide behind the
// helper's non-production fail-open: with the variable unset the request was
// admitted regardless of Origin, so the test proved nothing.
//
// Call pinCsrfSiteOrigin() at the top of any suite that exercises a
// CSRF-guarded route so the contract holds identically on a laptop and in CI.

export const TEST_SITE_ORIGIN = "https://tecpey.ir";

export function pinCsrfSiteOrigin(origin: string = TEST_SITE_ORIGIN): void {
  let previous: string | undefined;

  before(() => {
    previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = origin;
  });

  after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  });
}
