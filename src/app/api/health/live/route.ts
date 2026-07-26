export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "alive" },
    { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
