import type { Metadata } from "next";
import { AuthGatewayPage } from "@/components/auth/AuthGatewayPage";

export const metadata: Metadata = {
  title: "ثبت‌نام امن در تک‌پی",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <AuthGatewayPage locale="fa" mode="signup" />;
}
