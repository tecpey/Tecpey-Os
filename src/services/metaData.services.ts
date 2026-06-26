'use server'

import { getLocale } from "next-intl/server";

export const getMetaData = async () => {
  const locale = await getLocale();
  const baseUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/user/meta/data`, {
      next: { revalidate: 3600 },
      headers: {
        "Accept-Language": locale,
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.meta ?? data?.data ?? null;
  } catch {
    return null;
  }
};
