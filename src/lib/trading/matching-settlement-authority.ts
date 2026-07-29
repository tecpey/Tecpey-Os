import type { PoolClient } from "pg";
import {
  chargeTradeFeeTx,
  creditTradeFundsTx,
  debitTradeFundsTx,
  releaseMatchedOrderFundsTx,
} from "./wallet-service";
import {
  decimalAdd,
  isPositiveAmount,
  type ExactTradeAmounts,
} from "./matching-financials";

export const EXCHANGE_FEE_WALLET_ID = "system:exchange-fees";

export type ExactSettlementInput = {
  tradeId: string;
  baseAsset: string;
  quoteAsset: string;
  buyerUserId: string;
  sellerUserId: string;
  buyerOrderId: string;
  sellerOrderId: string;
  buyerHoldBasis: string;
  sellerHoldBasis: string;
  amounts: ExactTradeAmounts;
};

/**
 * Settle one exact fill inside the caller's matching transaction. Participant
 * fees are explicit debits and their sum is one platform credit with the same
 * trade identity, preserving quote-asset conservation.
 */
export async function settleExactTradeTx(
  client: PoolClient,
  input: ExactSettlementInput,
): Promise<void> {
  await releaseMatchedOrderFundsTx(
    client,
    input.buyerUserId,
    input.quoteAsset,
    input.buyerHoldBasis,
    input.buyerOrderId,
  );
  await debitTradeFundsTx(
    client,
    input.buyerUserId,
    input.quoteAsset,
    input.amounts.quoteGross,
    input.tradeId,
  );
  await creditTradeFundsTx(
    client,
    input.buyerUserId,
    input.baseAsset,
    input.amounts.quantity,
    input.tradeId,
  );
  if (isPositiveAmount(input.amounts.buyerFee)) {
    await chargeTradeFeeTx(
      client,
      input.buyerUserId,
      input.quoteAsset,
      input.amounts.buyerFee,
      input.tradeId,
    );
  }

  await releaseMatchedOrderFundsTx(
    client,
    input.sellerUserId,
    input.baseAsset,
    input.sellerHoldBasis,
    input.sellerOrderId,
  );
  await debitTradeFundsTx(
    client,
    input.sellerUserId,
    input.baseAsset,
    input.amounts.quantity,
    input.tradeId,
  );
  await creditTradeFundsTx(
    client,
    input.sellerUserId,
    input.quoteAsset,
    input.amounts.quoteGross,
    input.tradeId,
  );
  if (isPositiveAmount(input.amounts.sellerFee)) {
    await chargeTradeFeeTx(
      client,
      input.sellerUserId,
      input.quoteAsset,
      input.amounts.sellerFee,
      input.tradeId,
    );
  }

  const platformFeeCredit = decimalAdd(
    input.amounts.buyerFee,
    input.amounts.sellerFee,
  );
  if (isPositiveAmount(platformFeeCredit)) {
    await creditTradeFundsTx(
      client,
      EXCHANGE_FEE_WALLET_ID,
      input.quoteAsset,
      platformFeeCredit,
      input.tradeId,
    );
  }
}
