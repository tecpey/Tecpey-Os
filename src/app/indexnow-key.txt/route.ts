export const dynamic = "force-dynamic";
export async function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return new Response("not configured", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
