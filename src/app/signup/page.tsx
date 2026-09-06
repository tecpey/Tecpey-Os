import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "ساخت حساب تک‌پی | آکادمی",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  redirect("/academy/signup");
}
