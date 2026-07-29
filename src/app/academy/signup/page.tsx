import type { Metadata } from "next";
import { AcademyAuthClient } from "@/components/academy/AcademyAuthClient";
export const metadata: Metadata = { title: "ثبت‌نام آکادمی تک‌پی", robots: { index: false, follow: false } };
export default function Page() { return <AcademyAuthClient locale="fa" mode="signup" />; }
