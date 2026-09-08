import { NextRequest, NextResponse } from "next/server";
import { readAcademyProfileAvatar } from "@/lib/academy-profile-avatar-storage";
import { withObservability } from "@/lib/observe";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ owner: string; filename: string }> },
) {
  return withObservability(req, { route: "/api/academy-profile-avatar/[owner]/[filename]" }, async () => {
    const { owner, filename } = await context.params;
    const asset = await readAcademyProfileAvatar(owner, filename);
    if (!asset) {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    return new NextResponse(asset.bytes, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
