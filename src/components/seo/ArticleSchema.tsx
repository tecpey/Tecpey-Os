import { StructuredData } from "./StructuredData";

export function ArticleSchema({
  headline,
  description,
  url,
  datePublished = "2026-06-01",
  dateModified = "2026-06-08",
  language = "fa-IR",
  section = "Cryptocurrency Education",
}: {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  language?: string;
  section?: string;
}) {
  return (
    <StructuredData
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline,
        description,
        mainEntityOfPage: url,
        url,
        inLanguage: language,
        articleSection: section,
        datePublished,
        dateModified,
        author: {
          "@type": "Organization",
          name: "TecPey Research Team",
          url: "https://tecpey.ir",
        },
        publisher: {
          "@type": "Organization",
          name: "TecPey",
          url: "https://tecpey.ir",
          logo: {
            "@type": "ImageObject",
            url: "https://tecpey.ir/images/tecpey-logo.png",
          },
        },
      }}
    />
  );
}
