import type { Metadata } from "next";
import GlossaryClient from "@/components/content/GlossaryClient";

export const metadata: Metadata = {
  title: 'TecPey Crypto Glossary',
  description: 'A practical crypto glossary with definitions and risks.',
};

export default function Page() {
  return <GlossaryClient locale="en" />;
}
