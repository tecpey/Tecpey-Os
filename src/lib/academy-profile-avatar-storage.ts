import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_PROFILE_AVATAR_BYTES = 2 * 1024 * 1024;

type ProfileAvatarMime = "image/jpeg" | "image/png" | "image/webp";

const MIME_TO_EXTENSION: Readonly<Record<ProfileAvatarMime, "jpg" | "png" | "webp">> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const OWNER_RE = /^[0-9a-f]{32}$/;
const FILE_RE = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function storageRoot(): string {
  const configured = process.env.TECPEY_PROFILE_AVATAR_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (process.env.NODE_ENV === "production") {
    throw new Error("profile_avatar_storage_not_configured");
  }
  return path.resolve(process.cwd(), "storage", "profile-avatars");
}

export function profileAvatarOwnerKey(studentId: string): string {
  return createHash("sha256")
    .update(`tecpey-profile-avatar:${studentId}`)
    .digest("hex")
    .slice(0, 32);
}

function isProfileAvatarMime(value: string): value is ProfileAvatarMime {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, value);
}

function hasValidMagic(bytes: Uint8Array, mime: ProfileAvatarMime): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function storeAcademyProfileAvatar(input: {
  studentId: string;
  file: File;
}): Promise<{ url: string; bytes: number; contentType: ProfileAvatarMime }> {
  const rawContentType = input.file.type.toLowerCase();
  if (!isProfileAvatarMime(rawContentType)) {
    throw new Error("profile_avatar_type_not_allowed");
  }
  const contentType = rawContentType;
  const extension = MIME_TO_EXTENSION[contentType];
  if (!Number.isFinite(input.file.size) || input.file.size < 1 || input.file.size > MAX_PROFILE_AVATAR_BYTES) {
    throw new Error("profile_avatar_size_invalid");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (bytes.byteLength !== input.file.size || !hasValidMagic(bytes, contentType)) {
    throw new Error("profile_avatar_signature_invalid");
  }

  const owner = profileAvatarOwnerKey(input.studentId);
  const filename = `${randomUUID()}.${extension}`;
  const ownerDir = path.join(storageRoot(), owner);
  await mkdir(ownerDir, { recursive: true, mode: 0o750 });
  await writeFile(path.join(ownerDir, filename), bytes, { flag: "wx", mode: 0o640 });

  return {
    url: `/api/academy-profile-avatar/${owner}/${filename}`,
    bytes: bytes.byteLength,
    contentType,
  };
}

export function isOwnedAcademyProfileAvatarUrl(value: unknown, studentId: string): boolean {
  if (typeof value !== "string") return false;
  const owner = profileAvatarOwnerKey(studentId);
  return new RegExp(`^/api/academy-profile-avatar/${owner}/[0-9a-f-]{36}\\.(?:jpg|png|webp)$`).test(value);
}

export async function readAcademyProfileAvatar(owner: string, filename: string): Promise<{
  bytes: Buffer;
  contentType: ProfileAvatarMime;
} | null> {
  if (!OWNER_RE.test(owner) || !FILE_RE.test(filename)) return null;
  const extension = filename.slice(filename.lastIndexOf(".") + 1);
  const contentType: ProfileAvatarMime = extension === "jpg"
    ? "image/jpeg"
    : extension === "png"
      ? "image/png"
      : "image/webp";
  try {
    const bytes = await readFile(path.join(storageRoot(), owner, filename));
    if (bytes.length < 1 || bytes.length > MAX_PROFILE_AVATAR_BYTES) return null;
    if (!hasValidMagic(bytes, contentType)) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}


function filenameFromOwnedAvatarUrl(value: string, studentId: string): string | null {
  if (!isOwnedAcademyProfileAvatarUrl(value, studentId)) return null;
  const filename = value.slice(value.lastIndexOf("/") + 1);
  return FILE_RE.test(filename) ? filename : null;
}

/**
 * Reconciles the private avatar directory only after the profile record has
 * committed successfully. This makes replace/delete idempotent and removes
 * abandoned uploads from earlier failed saves without ever crossing owners.
 *
 * Backup/restore contract: TECPEY_PROFILE_AVATAR_DIR is persistent application
 * data and must be snapshotted/restored together with the database.
 */
/**
 * Deletes one exact previously-authoritative avatar after a newer profile
 * value has committed. Never scans the owner directory, so an older request
 * cannot delete a newer concurrent upload/commit.
 */
export async function deleteAcademyProfileAvatar(input: {
  studentId: string;
  url?: string | null;
}): Promise<{ removed: boolean }> {
  if (!input.url) return { removed: false };
  const filename = filenameFromOwnedAvatarUrl(input.url, input.studentId);
  if (!filename) throw new Error("profile_avatar_not_owned");
  const ownerDir = path.join(storageRoot(), profileAvatarOwnerKey(input.studentId));
  try {
    await rm(path.join(ownerDir, filename), { force: true });
    return { removed: true };
  } catch {
    return { removed: false };
  }
}

/**
 * Broad reconciliation is reserved for explicit maintenance/GC. Request-path
 * replacement must use deleteAcademyProfileAvatar with the exact previous URL.
 */
export async function reconcileAcademyProfileAvatars(input: {
  studentId: string;
  keepUrl?: string | null;
}): Promise<{ removed: number }> {
  const owner = profileAvatarOwnerKey(input.studentId);
  const keep = input.keepUrl ? filenameFromOwnedAvatarUrl(input.keepUrl, input.studentId) : null;
  if (input.keepUrl && !keep) throw new Error("profile_avatar_not_owned");

  const ownerDir = path.join(storageRoot(), owner);
  let entries: string[];
  try {
    entries = await readdir(ownerDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { removed: 0 };
    throw error;
  }

  let removed = 0;
  for (const filename of entries) {
    if (!FILE_RE.test(filename) || filename === keep) continue;
    try {
      await rm(path.join(ownerDir, filename), { force: true });
      removed += 1;
    } catch {
      // Profile persistence is authoritative. Cleanup is best-effort here and
      // can be retried by the next successful profile mutation.
    }
  }
  return { removed };
}
