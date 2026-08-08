import type { Metadata } from "next";
import { AuthGatewayPage } from "@/components/auth/AuthGatewayPage";

export const metadata: Metadata = {
  title: "Secure TecPey login",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return <AuthGatewayPage locale="en" mode="signin" />;
}
