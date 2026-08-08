import type { Metadata } from "next";
import { AuthGatewayPage } from "@/components/auth/AuthGatewayPage";

export const metadata: Metadata = {
  title: "Create your TecPey account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <AuthGatewayPage locale="en" mode="signup" />;
}
