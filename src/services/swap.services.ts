import { fetcher } from "@/utils/fetcher";
import type {
  CurrencyListResponse,
  MarketCurrency,
} from "@/types/market";

export const getCurrencies = async (
  page = 1,
  limit = 20,
  search = "",
): Promise<{
  data: MarketCurrency[];
  meta: { current_page: number; last_page: number };
}> => {
  try {
    const res = await fetcher<CurrencyListResponse>(
      `/api/v1/user/currency/list?page=${page}&limit=${limit}&symbol=${search}`,
      {
        method: "GET",
      },
    );


    return {
      data: res?.data ?? [],
      meta: {
        current_page: res?.meta?.current_page ?? page,
        last_page: res?.meta?.last_page ?? 1,
      },
    };
  } catch {
    return {
      data: [],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    };
  }
};

type Chart = {
  labels: string[];
  prices: number[];
};

export function normalizeChartPayload(value: unknown): Chart {
  if (
    typeof value !== "object" ||
    value === null ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null
  ) {
    return { labels: [], prices: [] };
  }

  const chart = value.data as { labels?: unknown; prices?: unknown };
  if (!Array.isArray(chart.labels) || !Array.isArray(chart.prices)) {
    return { labels: [], prices: [] };
  }

  const normalized: Chart = { labels: [], prices: [] };
  const pairCount = Math.min(chart.labels.length, chart.prices.length);
  for (let index = 0; index < pairCount; index += 1) {
    const label = chart.labels[index];
    const rawPrice = chart.prices[index];
    const price =
      typeof rawPrice === "number" ||
      (typeof rawPrice === "string" && rawPrice.trim().length > 0)
        ? Number(rawPrice)
        : Number.NaN;
    if (
      (typeof label !== "string" && typeof label !== "number") ||
      !Number.isFinite(price)
    ) {
      continue;
    }
    normalized.labels.push(String(label));
    normalized.prices.push(price);
  }
  return normalized;
}

export const getCurrencyInfo = async ({
  symbol,
}: {
  symbol: string;
}): Promise<Chart> => {
  try {

    const chartBaseUrl =
      process.env.NEXT_PUBLIC_API_BACKEND_URL;

    // BTCUSDT -> BTC
    const formattedSymbol =
      symbol.replace("USDT", "");

    const response = await fetch(
      `${chartBaseUrl}/api/v1/currency/chart?symbol=${formattedSymbol}&type=line`
    );

    return normalizeChartPayload(await response.json());

  } catch {


    return {
      labels: [],
      prices: [],
    };
  }
};
