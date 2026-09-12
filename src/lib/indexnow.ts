const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

type IndexNowSubmissionOptions = {
  governedPublicationUrls?: readonly string[];
};

export async function submitIndexNowUrls(
  urls: string[],
  options: IndexNowSubmissionOptions = {},
): Promise<{ configured: boolean; submitted: number; status?: number }> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return { configured: false, submitted: 0 };

  const governed = new Set(
    (options.governedPublicationUrls ?? [])
      .filter((url) => /^https:\/\/tecpey\.ir\//i.test(url)),
  );

  // Fail closed: callers must explicitly attest URLs that have already passed
  // governed publication authority. Legacy/growth-only decisions cannot submit.
  if (governed.size === 0) return { configured: true, submitted: 0 };

  const selected = Array.from(new Set(
    urls.filter((url) => /^https:\/\/tecpey\.ir\//i.test(url) && governed.has(url)),
  )).slice(0, 10_000);
  if (!selected.length) return { configured: true, submitted: 0 };
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "tecpey.ir", key, keyLocation: "https://tecpey.ir/indexnow-key.txt", urlList: selected }),
      signal: AbortSignal.timeout(8_000),
    });
    return { configured: true, submitted: response.ok ? selected.length : 0, status: response.status };
  } catch {
    return { configured: true, submitted: 0 };
  }
}
