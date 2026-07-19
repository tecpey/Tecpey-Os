import type { PoolClient } from "pg";
import { D, toFixed } from "./decimal";
import type { Order, OrderStatus } from "./types";

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    market: String(row.market),
    side: String(row.side) as Order["side"],
    type: String(row.type) as Order["type"],
    status: String(row.status) as OrderStatus,
    price: row.price == null ? null : String(row.price),
    stopPrice: row.stop_price == null ? null : String(row.stop_price),
    quantity: String(row.quantity),
    filledQuantity: String(row.filled_quantity),
    remainingQuantity: String(row.remaining_quantity),
    avgFillPrice: row.avg_fill_price == null ? null : String(row.avg_fill_price),
    clientOrderId: row.client_order_id == null ? null : String(row.client_order_id),
    timeInForce: String(row.time_in_force) as Order["timeInForce"],
    expiresAt: row.expires_at == null ? null : new Date(row.expires_at as string).toISOString(),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function lockOrdersForMatchTx(
  client: PoolClient,
  orderIds: string[],
): Promise<Map<string, Order>> {
  const unique = [...new Set(orderIds)].sort();
  const result = await client.query(
    `SELECT *
       FROM orders
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [unique],
  );
  return new Map(result.rows.map((row) => {
    const order = rowToOrder(row);
    return [order.id, order] as const;
  }));
}

export async function applyExactOrderFillTx(
  client: PoolClient,
  orderId: string,
  fillQuantity: string,
  fillPrice: string,
): Promise<Order | null> {
  const quantity = toFixed(fillQuantity, 10);
  const price = toFixed(fillPrice, 10);
  if (D(quantity).lte(0) || D(price).lte(0)) throw new Error("invalid_exact_fill");

  const result = await client.query(
    `UPDATE orders
        SET filled_quantity = filled_quantity + $2::numeric,
            remaining_quantity = remaining_quantity - $2::numeric,
            avg_fill_price = CASE
              WHEN filled_quantity = 0 THEN $3::numeric
              ELSE ((COALESCE(avg_fill_price, 0) * filled_quantity) + ($3::numeric * $2::numeric))
                   / (filled_quantity + $2::numeric)
            END,
            status = CASE
              WHEN remaining_quantity = $2::numeric THEN 'FILLED'
              ELSE 'PARTIALLY_FILLED'
            END,
            updated_at = NOW(),
            version = version + 1
      WHERE id = $1
        AND status IN ('NEW', 'PARTIALLY_FILLED')
        AND remaining_quantity >= $2::numeric
      RETURNING *`,
    [orderId, quantity, price],
  );
  return result.rows[0] ? rowToOrder(result.rows[0]) : null;
}

export async function setExactOrderStatusTx(
  client: PoolClient,
  orderId: string,
  status: Extract<OrderStatus, "CANCELLED" | "EXPIRED" | "REJECTED">,
): Promise<Order | null> {
  const result = await client.query(
    `UPDATE orders
        SET status = $2,
            updated_at = NOW(),
            version = version + 1
      WHERE id = $1
        AND status IN ('NEW', 'PARTIALLY_FILLED')
      RETURNING *`,
    [orderId, status],
  );
  return result.rows[0] ? rowToOrder(result.rows[0]) : null;
}
