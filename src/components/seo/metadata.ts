import type { Metadata } from "next";

const base = "https://tecpey.ir";
const ogImage = `${base}/images/tecpey-og.png`;

export function pageMetadata({
  title,
  description,
  path,
  enPath,
  locale = "fa_IR",
  keywords,
}: {
  title: string;
  description: string;
  path: string;
  enPath?: string;
  locale?: "fa_IR" | "en_US";
  keywords?: string[];
}): Metadata {
  const canonical = `${base}${path}`;
  const faUrl = `${base}${path.startsWith("/en") && enPath ? enPath : path.replace(/^\/en/, "") || "/"}`;
  const enUrl = `${base}${path.startsWith("/en") ? path : (enPath ?? `/en${path === "/" ? "" : path}`)}`;
  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: {
      canonical,
      languages: {
        "fa-IR": faUrl,
        "en-US": enUrl,
        "x-default": faUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "TecPey",
      locale,
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "TecPey — تک‌پی، نقطه امن ورود به بازار رمزارز",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
