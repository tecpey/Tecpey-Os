import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { normalizeAcademyUsername } from "@/lib/academy-auth";

async function readLocalUsernameStore() {
  try {
    const raw = await readFile(path.join(process.cwd(), "storage", "academy-auth.local.json"), "utf8");
    const parsed = JSON.parse(raw) as { emailByUsername?: Record<string, string> };
    return parsed.emailByUsername || {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = normalizeAcademyUsername(searchParams.get("username"));
  if (username.length < 3) {
    return NextResponse.json({ ok: false, available: false, error: "invalid_username" }, { status: 400 });
  }
  // Local-first check for localhost/dev. Production should also enforce uniqueness in DB at register time.
  const local = await readLocalUsernameStore();
  return NextResponse.json({ ok: true, username, available: !local[username] });
}
