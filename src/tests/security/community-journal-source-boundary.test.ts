import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const authorityPath = "src/lib/community-journal-authority.ts";
const routePath = "src/app/api/community/profile/route.ts";
const clientPath = "src/components/academy/community/PeerJournals.tsx";

describe("Community journal source boundary", () => {
  it("keeps aliases pseudonymous and unlinked from public profile identifiers", async () => {
    const authority = await readFile(authorityPath, "utf8");
    assert.match(authority, /AS author_seed/);
    assert.match(authority, /profile\.tenant_id \|\| ':' \|\| profile\.principal_type \|\| ':' \|\| profile\.principal_id/);
    assert.match(authority, /tecpey-community-journal-author-v1/);
    assert.doesNotMatch(authority, /profile\.public_profile_id::text/);
  });

  it("fails closed on secrets, direct contacts and explicit financial promotion", async () => {
    const authority = await readFile(authorityPath, "utf8");
    for (const token of [
      "SECRET_LABEL",
      "PUBLIC_SIGNAL_PATTERN",
      "SOCIAL_LINK_PATTERN",
      "SECRET_PLACEHOLDER",
      "SAFETY_PLACEHOLDER",
      "minimizeCommunityJournalPublicText",
    ]) {
      assert.equal(authority.includes(token), true, token);
    }
  });

  it("keeps feed reads on strict tenant/principal context and the governed profile route", async () => {
    const route = await readFile(routePath, "utf8");
    assert.match(
      route,
      /view !== "profile" &&\s*view !== "journal-feed" &&\s*view !== "challenge-center"/,
    );
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /scopes: \["community:journal:read"\]/);
    assert.match(route, /listCommunityJournalFeed\(\{/);
    assert.match(route, /response\.headers\.set\("Vary", "Cookie"\)/);

    const journalStart = route.indexOf('if (view === "journal-feed")');
    const journalEnd = route.indexOf('if (view === "challenge-center")', journalStart);
    assert.notEqual(journalStart, -1);
    assert.notEqual(journalEnd, -1);
    const journalBlock = route.slice(journalStart, journalEnd);
    assert.doesNotMatch(journalBlock, /PLATFORM\.DEFAULT_TENANT_ID/);
    assert.match(journalBlock, /resolveTenantPrincipalContext\(\{/);
    assert.match(journalBlock, /scopes: \["community:journal:read"\]/);
  });

  it("keeps consent controls available when only the feed load fails", async () => {
    const client = await readFile(clientPath, "utf8");
    assert.match(client, /let loadedProfile: CommunityOwnedProfileClient \| null = null/);
    assert.match(client, /setProfile\(loadedProfile\)/);
    assert.match(client, /if \(!loadedProfile\) setProfile\(null\)/);
    assert.match(client, /view=journal-feed/);
    assert.doesNotMatch(client, /DEMO_SHARED_ENTRIES|loadJournal|loadCommunityProfile|localStorage/);
  });
});
