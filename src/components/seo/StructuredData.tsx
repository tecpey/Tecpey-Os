export function StructuredData({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": ["Organization", "FinancialService", "LocalBusiness"],
  "@id": "https://tecpey.ir/#organization",
  name: "TecPey",
  alternateName: "تک‌پی",
  url: "https://tecpey.ir",
  logo: "https://tecpey.ir/images/tecpey-logo.png",
  image: "https://tecpey.ir/images/tecpey-logo.png",
  description:
    "TecPey is a Persian crypto exchange platform focused on live crypto prices, security, transparent fees, education and safer onboarding.",
  areaServed: ["IR"],
  currenciesAccepted: "IRR, USDT",
  paymentAccepted: "Bank transfer, Crypto",
  telephone: "+98-11-32338026",
  email: "info@tecpey.ir",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Chaharrah Tondast, next to Cristal, TechnoPardakht office",
    addressLocality: "Babol",
    addressRegion: "Mazandaran",
    addressCountry: "IR",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+98-11-32338026",
      email: "info@tecpey.ir",
      availableLanguage: ["fa", "en"],
    },
  ],
  sameAs: [
    "https://t.me/tecpeyco",
    "https://instagram.com/tecpeyco",
    "https://discord.gg/tecpeyex",
  ],
  knowsAbout: [
    "Cryptocurrency",
    "Bitcoin",
    "Tether",
    "USDT",
    "Ethereum",
    "Crypto Exchange",
    "Crypto Prices",
    "Crypto Security",
    "Crypto Education",
  ],
};

export const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "TecPey",
  url: "https://tecpey.ir",
  inLanguage: ["fa-IR", "en-US"],
  potentialAction: {
    "@type": "SearchAction",
    target: "https://tecpey.ir/markets?search={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
