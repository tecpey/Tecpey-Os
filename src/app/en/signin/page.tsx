import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Log in to TecPey | Academy",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  redirect("/en/academy/login");
}
