import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'tecpey-web',
      timestamp: new Date().toISOString(),
      checks: { app: 'ok' },
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
