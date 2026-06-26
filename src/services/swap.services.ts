import { fetcher } from "@/utils/fetcher";

export const getCurrencies = async (page = 1, limit = 20, search = "") => {
  try {
    const res = await fetcher<any>(
      `/api/v1/user/currency/list?page=${page}&limit=${limit}&symbol=${search}`,
      {
        method: "GET",
      },
    );


    return {
      data: res?.data ?? [],
      meta: res?.meta ?? {
        current_page: page,
        last_page: 1,
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

    const data = await response.json();

    return data?.data ?? {
      labels: [],
      prices: [],
    };

  } catch (err) {


    return {
      labels: [],
      prices: [],
    };
  }
};