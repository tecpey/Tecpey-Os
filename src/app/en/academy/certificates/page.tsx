import type { Metadata } from "next";
import { AcademyCertificatesClient } from "@/components/academy/AcademyCertificatesClient";

export const metadata: Metadata = { title: "TecPey Verified Certificates", description: "Verified TecPey Academy certificates with QR and public verification." };
export default function Page() { return <AcademyCertificatesClient locale="en" />; }
