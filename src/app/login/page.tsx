import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "ورود به حساب تک‌پی | آکادمی",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  redirect("/academy/login");
}
