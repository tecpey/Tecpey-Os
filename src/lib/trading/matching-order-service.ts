import type { PoolClient } from "pg";
import type { OrderStatus } from "./types";
import { canonicalMatchingInput } from "./matching-financials";

/**
 * Exact order fill mutation for the matching engine. PostgreSQL performs VWAP
 * and remaining arithmetic in NUMERIC; JavaScript only supplies canonical
 * decimal strings.
 */
export async function applyExactOrderFillTx(
  client: PoolClient,
  input: {
    orderId: string;
    fillQuantity: string;
    fillPrice: string;
    newStatus: OrderStatus;
  },
): Promise<boolean> {
  const fillQuantity = canonicalMatchingInput(
    input.fillQuantity,
    "order_fill_quantity",
  );
  const fillPrice = canonicalMatchingInput(input.fillPrice, "order_fill_price");
  const result = await client.query(
    `UPDATE orders
        SET filled_quantity = filled_quantity + $2::numeric,
            remaining_quantity = remaining_quantity - $2::numeric,
            avg_fill_price = CASE
              WHEN filled_quantity = 0 THEN $3::numeric
              ELSE (
                filled_quantity * COALESCE(avg_fill_price, $3::numeric)
                + $2::numeric * $3::numeric
              ) / (filled_quantity + $2::numeric)
            END,
            status = $4,
            version = version + 1,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND status IN ('NEW', 'PARTIALLY_FILLED')
        AND remaining_quantity >= $2::numeric
      RETURNING id`,
    [input.orderId, fillQuantity, fillPrice, input.newStatus],
  );
  return result.rowCount === 1;
}
