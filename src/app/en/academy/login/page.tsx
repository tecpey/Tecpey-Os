import type { Metadata } from "next";
import { AcademyAuthClient } from "@/components/academy/AcademyAuthClient";
export const metadata: Metadata = { title: "TecPey Academy Login", robots: { index: false, follow: false } };
export default function Page() { return <AcademyAuthClient locale="en" mode="login" />; }
