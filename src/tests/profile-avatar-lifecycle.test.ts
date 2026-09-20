import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  deleteAcademyProfileAvatar,
  isOwnedAcademyProfileAvatarUrl,
  profileAvatarOwnerKey,
  readAcademyProfileAvatar,
  reconcileAcademyProfileAvatars,
  storeAcademyProfileAvatar,
} from "../lib/academy-profile-avatar-storage";

const originalDir = process.env.TECPEY_PROFILE_AVATAR_DIR;
const dirs: string[] = [];

async function tempStorage() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecpey-avatar-"));
  dirs.push(dir);
  process.env.TECPEY_PROFILE_AVATAR_DIR = dir;
  return dir;
}

function jpegFile(seed: number): File {
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, seed, 0x00, 0x01]);
  return {
    type: "image/jpeg",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File;
}

afterEach(async () => {
  if (originalDir === undefined) delete process.env.TECPEY_PROFILE_AVATAR_DIR;
  else process.env.TECPEY_PROFILE_AVATAR_DIR = originalDir;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  it("cannot delete a newer committed avatar when an older cleanup runs late", async () => {
    await tempStorage();
    const studentId = "66666666-6666-4666-8666-666666666666";
    const original = await storeAcademyProfileAvatar({ studentId, file: jpegFile(7) });
    const firstReplacement = await storeAcademyProfileAvatar({ studentId, file: jpegFile(8) });
    const newest = await storeAcademyProfileAvatar({ studentId, file: jpegFile(9) });

    // Simulate adversarial completion order: B commits newest, then A's older
    // post-commit cleanup finally runs. A may delete only its exact predecessor.
    await deleteAcademyProfileAvatar({ studentId, url: firstReplacement.url });
    await deleteAcademyProfileAvatar({ studentId, url: original.url });

    assert.ok(await readAcademyProfileAvatar(
      profileAvatarOwnerKey(studentId),
      newest.url.split("/").at(-1)!,
    ));
  });

  it("exact deletion remains owner-scoped", async () => {
    await tempStorage();
    const alice = "77777777-7777-4777-8777-777777777777";
    const bob = "88888888-8888-4888-8888-888888888888";
    const stored = await storeAcademyProfileAvatar({ studentId: alice, file: jpegFile(10) });
    await assert.rejects(
      deleteAcademyProfileAvatar({ studentId: bob, url: stored.url }),
      /profile_avatar_not_owned/,
    );
    assert.ok(await readAcademyProfileAvatar(
      profileAvatarOwnerKey(alice),
      stored.url.split("/").at(-1)!,
    ));
  });
});

describe("academy profile avatar lifecycle", () => {
  it("persists the committed photo across reads and removes replaced files only after reconciliation", async () => {
    await tempStorage();
    const studentId = "11111111-1111-4111-8111-111111111111";

    const first = await storeAcademyProfileAvatar({ studentId, file: jpegFile(1) });
    assert.ok(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), first.url.split("/").at(-1)!));

    const replacement = await storeAcademyProfileAvatar({ studentId, file: jpegFile(2) });
    // Upload alone must not destroy the currently committed photo.
    assert.ok(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), first.url.split("/").at(-1)!));

    await reconcileAcademyProfileAvatars({ studentId, keepUrl: replacement.url });
    assert.equal(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), first.url.split("/").at(-1)!), null);
    assert.ok(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), replacement.url.split("/").at(-1)!));
  });

  it("deletes all private files after a committed photo removal", async () => {
    await tempStorage();
    const studentId = "22222222-2222-4222-8222-222222222222";
    const stored = await storeAcademyProfileAvatar({ studentId, file: jpegFile(3) });

    await reconcileAcademyProfileAvatars({ studentId, keepUrl: null });
    assert.equal(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), stored.url.split("/").at(-1)!), null);
  });

  it("never accepts another student's URL as owned or as a reconciliation keep target", async () => {
    await tempStorage();
    const alice = "33333333-3333-4333-8333-333333333333";
    const bob = "44444444-4444-4444-8444-444444444444";
    const stored = await storeAcademyProfileAvatar({ studentId: alice, file: jpegFile(4) });

    assert.equal(isOwnedAcademyProfileAvatarUrl(stored.url, bob), false);
    await assert.rejects(
      reconcileAcademyProfileAvatars({ studentId: bob, keepUrl: stored.url }),
      /profile_avatar_not_owned/,
    );
    assert.ok(await readAcademyProfileAvatar(profileAvatarOwnerKey(alice), stored.url.split("/").at(-1)!));
  });

  it("cleans abandoned uploads on the next successful owner reconciliation", async () => {
    await tempStorage();
    const studentId = "55555555-5555-4555-8555-555555555555";
    const abandoned = await storeAcademyProfileAvatar({ studentId, file: jpegFile(5) });
    const committed = await storeAcademyProfileAvatar({ studentId, file: jpegFile(6) });

    const result = await reconcileAcademyProfileAvatars({ studentId, keepUrl: committed.url });
    assert.equal(result.removed, 1);
    assert.equal(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), abandoned.url.split("/").at(-1)!), null);
    assert.ok(await readAcademyProfileAvatar(profileAvatarOwnerKey(studentId), committed.url.split("/").at(-1)!));
  });
});
