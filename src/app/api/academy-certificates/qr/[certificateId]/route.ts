import { NextRequest, NextResponse } from "next/server";
import * as QRCode from "qrcode";
import { certificateVerifyUrl } from "@/lib/academy-certificates";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  const safeId = String(certificateId || "").replace(/[^A-Z0-9\-]/gi, "").slice(0, 64);
  const svg = await QRCode.toString(certificateVerifyUrl(safeId), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#020617", light: "#ffffff" },
  });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
