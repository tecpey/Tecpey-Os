import type { Metadata } from "next";
import { AcademyTermPage, generateTermMetadata } from "@/components/academy/AcademyTermPage";

export const metadata: Metadata = generateTermMetadata("term-6");

export default function Page() {
  return <AcademyTermPage slug="term-6" />;
}
