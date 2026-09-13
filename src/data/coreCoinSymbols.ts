export const CORE_COIN_SYMBOLS = [
  "BTC", "USDT", "ETH", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA", "TRX",
  "AVAX", "LINK", "DOT", "LTC", "BCH", "NEAR", "APT", "SUI", "ARB", "OP",
  "ATOM", "PEPE", "SHIB", "FIL", "ICP", "INJ", "SEI", "XLM", "UNI", "MKR",
] as const;

export const CORE_COIN_SYMBOL_SET: ReadonlySet<string> = new Set(CORE_COIN_SYMBOLS);
