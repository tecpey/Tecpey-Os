import type { Metadata } from "next";
import { AcademyCertificatesClient } from "@/components/academy/AcademyCertificatesClient";

export const metadata: Metadata = { title: "مدارک قابل استعلام آکادمی تک‌پی", description: "مدارک قابل استعلام آکادمی تک‌پی با QR، شناسه یکتا و صفحه Verify." };
export default function Page() { return <AcademyCertificatesClient locale="fa" />; }
