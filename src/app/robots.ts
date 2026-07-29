import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/founder/",
          "/storage/",
          "/command-center/",
          "/dashboard",
          "/settings",
          "/login",
          "/signin",
          "/signup",
          "/mentor",
          "/academy/profile",
          "/academy/dashboard",
          "/academy/onboarding",
          "/academy/notifications",
        ],
      },
    ],
    sitemap: "https://tecpey.ir/sitemap.xml",
    host: "https://tecpey.ir",
  };
}
