import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("academy profile editor contract", () => {
  it("keeps verified account claims read-only and stores private profile details", () => {
    const editor = read("src/components/academy/AcademyOnboardingClient.tsx");
    const route = read("src/app/api/academy-student-profile/route.ts");
    const cartax = read("src/lib/student-cartax.ts");

    assert.match(editor, /ایمیل تأییدشده/);
    assert.match(editor, /شماره موبایل تأییدشده/);
    assert.match(editor, /readOnly value=\{email/);
    assert.match(editor, /readOnly value=\{phone/);
    assert.match(editor, /birthDate: birthDate \|\| null/);
    assert.match(editor, /gender: gender \|\| null/);
    assert.match(editor, /country: country\.trim\(\) \|\| null/);

    assert.match(route, /const email = session\.email \?\? undefined/);
    assert.match(route, /phone_verified_at IS NOT NULL/);
    assert.doesNotMatch(route, /email:\s*body\.email/);
    assert.doesNotMatch(route, /phone:\s*body\.phone/);

    assert.match(cartax, /s\.photo_url/);
    assert.match(cartax, /s\.birth_date/);
    assert.match(cartax, /s\.gender/);
    assert.match(cartax, /s\.country/);
  });

  it("uses a bounded same-origin upload path and separates private photo from public avatar", () => {
    const editor = read("src/components/academy/AcademyOnboardingClient.tsx");
    const upload = read("src/app/api/academy-profile-avatar/route.ts");
    const storage = read("src/lib/academy-profile-avatar-storage.ts");
    const profileRoute = read("src/app/api/academy-student-profile/route.ts");

    assert.match(editor, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(editor, /MAX_AVATAR_BYTES = 2 \* 1024 \* 1024/);
    assert.match(upload, /verifyCsrfOrigin/);
    assert.match(upload, /strictRevocation: true/);
    assert.match(storage, /profile_avatar_signature_invalid/);
    assert.match(storage, /TECPEY_PROFILE_AVATAR_DIR/);
    assert.match(storage, /writeFile\([^\n]+\{ flag: "wx", mode: 0o640 \}\)/);
    assert.match(profileRoute, /isOwnedAcademyProfileAvatarUrl/);
    assert.match(profileRoute, /AVATAR_OPTIONS\.has\(requestedAvatar\)/);
    assert.match(profileRoute, /photoUrl/);
  });

  it("registers the immutable profile schema migration after the current authority chain", () => {
    const migration = read("src/lib/db-migrate-academy-profile-details.ts");
    const content = read("src/lib/db-migration-content.ts");
    const registry = read("src/lib/db-migration-registry.ts");

    for (const column of ["birth_date", "gender", "country", "photo_url"]) {
      assert.match(migration, new RegExp(column));
    }
    assert.match(content, /0100_academy_profile_details\.sql/);
    assert.match(registry, /entry\(85, "migration-step-085", CANONICAL_MIGRATION_CONTENT\.academyProfileDetails/);
    assert.match(registry, /runAcademyProfileDetailsMigrations/);
  });

  it("routes signed-in Academy users back to their learning dashboard", () => {
    const nav = read("src/components/tecpey/GlobalMobileNavigation.tsx");
    assert.match(nav, /academyProfileReady/);
    assert.match(nav, /href\("\/academy\/profile"\)/);
  });
});
