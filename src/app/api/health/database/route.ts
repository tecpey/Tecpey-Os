import { NextResponse } from "next/server";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const result = await withDb(async (client) => {
    const row = await client.query("SELECT 1 AS ok");
    return row.rows[0]?.ok === 1;
  });
  const latencyMs = Date.now() - start;

  if (!result.enabled) {
    return NextResponse.json(
      { ok: false, database: "not_configured", latencyMs },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, database: "connected", latencyMs },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
