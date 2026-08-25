export type MarketScalar = string | number | null | undefined;

export type MarketPriceData = {
  symbol?: string;
  last?: MarketScalar;
  price?: MarketScalar;
  lastPrice?: MarketScalar;
  close?: MarketScalar;
  changePercent?: MarketScalar;
  volume?: MarketScalar;
  quoteVolume?: MarketScalar;
  low24h?: MarketScalar;
  high24h?: MarketScalar;
  rank?: MarketScalar;
  timestamp?: MarketScalar;
  marketCap?: MarketScalar;
  market_cap?: MarketScalar;
  circulatingSupply?: MarketScalar;
  totalSupply?: MarketScalar;
  maxSupply?: MarketScalar;
  fdv?: MarketScalar;
  fullyDilutedValuation?: MarketScalar;
  priceIRT?: MarketScalar;
  [key: string]: unknown;
};

export type MarketCurrency = {
  id?: string | number;
  symbol?: string;
  name?: string;
  faName?: string;
  fa?: string;
  icon?: string;
  priceData?: MarketPriceData;
  last?: MarketScalar;
  lastPrice?: MarketScalar;
  price?: MarketScalar;
  changePercent?: MarketScalar;
  volume?: MarketScalar;
  marketCap?: MarketScalar;
  circulatingSupply?: MarketScalar;
  totalSupply?: MarketScalar;
  maxSupply?: MarketScalar;
  fdv?: MarketScalar;
  fullyDilutedValuation?: MarketScalar;
  priceIRT?: MarketScalar;
  change?: string | number;
  rank?: MarketScalar;
  marketDataSource?: string;
  marketDataSourceUrl?: string;
  marketDataUpdatedAt?: string;
  [key: string]: unknown;
};

export type MarketTickerUpdate = MarketPriceData & {
  symbol: string;
};

export type CurrencyListResponse = {
  data?: MarketCurrency[];
  meta?: {
    current_page?: number;
    last_page?: number;
  };
};
