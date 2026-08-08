import type { Metadata } from "next";
import { AuthGatewayPage } from "@/components/auth/AuthGatewayPage";

export const metadata: Metadata = {
  title: "ورود امن به تک‌پی",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return <AuthGatewayPage locale="fa" mode="signin" />;
}
