import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Create your TecPey account | Academy",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  redirect("/en/academy/signup");
}
