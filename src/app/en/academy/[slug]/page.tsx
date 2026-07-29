import type { Metadata } from "next";
import { AcademyTermPageEn, generateTermMetadataEn, getAcademyTermEn } from "@/components/academy/AcademyTermPageEn";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return generateTermMetadataEn(slug) as Metadata;
}

export function generateStaticParams() {
  return ["term-1", "term-2", "term-3", "term-4", "term-5", "term-6", "term-7"].map((slug) => ({ slug }));
}

export default async function AcademyEnglishTerm({ params }: Props) {
  const { slug } = await params;
  if (!getAcademyTermEn(slug)) return notFound();
  return <AcademyTermPageEn slug={slug} />;
}
