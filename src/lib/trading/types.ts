// ── Asset ─────────────────────────────────────────────────────────────────────

export type AssetStatus = "active" | "maintenance" | "suspended" | "delisted";

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  precision: number;
  status: AssetStatus;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  minDeposit: string;
  minWithdraw: string;
  withdrawFee: string;
  displayOrder: number;
  metadata: Record<string, unknown>;
};

// ── Market ────────────────────────────────────────────────────────────────────

export type MarketStatus = "active" | "maintenance" | "closed" | "suspended";

export type Market = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: MarketStatus;
  tickSize: string;
  stepSize: string;
  minOrderValue: string;
  maxOrderValue: string;
  pricePrecision: number;
  quantityPrecision: number;
  makerFee: string;
  takerFee: string;
};

// ── Wallet Ledger ─────────────────────────────────────────────────────────────

export type LedgerEntryType =
  | "deposit"
  | "withdraw"
  | "trade_debit"
  | "trade_credit"
  | "fee"
  | "adjustment"
  | "hold"
  | "release";

export type WalletLedgerEntry = {
  id: string;
  walletId: string;
  asset: string;
  type: LedgerEntryType;
  amount: string;
  balanceAfter: string;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: string;
};

// ── Order ─────────────────────────────────────────────────────────────────────

export type OrderSide = "buy" | "sell";

export type OrderType = "limit" | "market" | "ioc" | "fok" | "gtc" | "stop_limit";

export type OrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED";

export type TimeInForce = "GTC" | "IOC" | "FOK";

export type Order = {
  id: string;
  userId: string;
  market: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: string | null;
  stopPrice: string | null;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  avgFillPrice: string | null;
  clientOrderId: string | null;
  timeInForce: TimeInForce;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Trade ─────────────────────────────────────────────────────────────────────

export type MakerSide = "buy" | "sell";

export type Trade = {
  id: string;
  market: string;
  buyerOrderId: string;
  sellerOrderId: string;
  price: string;
  quantity: string;
  feeBuyer: string;
  feeSeller: string;
  makerSide: MakerSide;
  executedAt: string;
};

// ── Order Book ────────────────────────────────────────────────────────────────

export type OrderBookLevel = {
  price: string;
  quantity: string;
  orderCount: number;
};

export type OrderBookSnapshot = {
  market: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: string;
};

// ── Place Order Request ───────────────────────────────────────────────────────

export type PlaceOrderRequest = {
  market: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  stopPrice?: string;
  clientOrderId?: string;
  timeInForce?: TimeInForce;
};
