// A minimal, deterministic ZIP writer.
//
// QA-050 evidence names four screenshot archives. Building them by shelling out
// to `zip` would make the evidence depend on whether a particular host has that
// binary — a property of the machine, not of the run — and a control that
// silently produces nothing when a tool is missing is worse than one that
// cannot run at all.
//
// Store-only (no compression) on purpose: PNGs are already compressed, so
// deflating them buys almost nothing and costs a second implementation to get
// wrong. Timestamps are fixed so the same inputs always produce the same bytes,
// which is what lets an archive digest mean anything.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_END = 0x06054b50;
const VERSION_STORE = 10; // 1.0 — store only
const DOS_EPOCH_TIME = 0;
const DOS_EPOCH_DATE = 0x0021; // 1980-01-01, the earliest a DOS date can express

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Write a store-only ZIP of the given files.
 *
 * @param archivePath where to write
 * @param entries     [{ name, path }] — name is the path inside the archive
 * @returns { bytes, sha256, entryCount }
 */
export function writeStoreOnlyZip(archivePath, entries) {
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of sorted) {
    const name = Buffer.from(entry.name.split(path.sep).join("/"), "utf8");
    const content = readFileSync(entry.path);
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIGNATURE_LOCAL, 0);
    local.writeUInt16LE(VERSION_STORE, 4);
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(DOS_EPOCH_TIME, 10);
    local.writeUInt16LE(DOS_EPOCH_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    chunks.push(local, name, content);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    header.writeUInt16LE(VERSION_STORE, 4); // version made by
    header.writeUInt16LE(VERSION_STORE, 6); // version needed
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(DOS_EPOCH_TIME, 12);
    header.writeUInt16LE(DOS_EPOCH_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(content.length, 20);
    header.writeUInt32LE(content.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk number
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(0, 38); // external attributes
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length + content.length;
  }

  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIGNATURE_END, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  const archive = Buffer.concat([...chunks, centralBytes, end]);
  writeFileSync(archivePath, archive);
  return {
    bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex"),
    entryCount: sorted.length,
  };
}
