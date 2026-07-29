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

    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("data" in data) ||
      typeof data.data !== "object" ||
      data.data === null
    ) {
      return { labels: [], prices: [] };
    }
    const chart = data.data as { labels?: unknown; prices?: unknown };

    return {
      labels: Array.isArray(chart.labels)
        ? chart.labels.map((label) => String(label))
        : [],
      prices: Array.isArray(chart.prices)
        ? chart.prices.map((price) => Number(price)).filter(Number.isFinite)
        : [],
    };

  } catch {


    return {
      labels: [],
      prices: [],
    };
  }
};
