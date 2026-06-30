import { randomUUID } from "crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Order, OrderSide, OrderStatus, OrderType, PlaceOrderRequest, TimeInForce } from "./types";
import { createTradingEvent } from "./events";

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    market: String(row.market),
    side: String(row.side) as OrderSide,
    type: String(row.type) as OrderType,
    status: String(row.status) as OrderStatus,
    price: row.price != null ? String(row.price) : null,
    stopPrice: row.stop_price != null ? String(row.stop_price) : null,
    quantity: String(row.quantity),
    filledQuantity: String(row.filled_quantity),
    remainingQuantity: String(row.remaining_quantity),
    avgFillPrice: row.avg_fill_price != null ? String(row.avg_fill_price) : null,
    clientOrderId: row.client_order_id ? String(row.client_order_id) : null,
    timeInForce: String(row.time_in_force) as TimeInForce,
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

// ── Create order ──────────────────────────────────────────────────────────────

export type CreateOrderInput = PlaceOrderRequest & {
  userId: string;
};

export async function createOrder(input: CreateOrderInput): Promise<Order | null> {
  const id = randomUUID();
  const timeInForce: TimeInForce = input.timeInForce ?? "GTC";

  const result = await withDb(async (client) => {
    const rows = await client.query(
      `INSERT INTO orders
         (id, user_id, market, side, type, status, price, stop_price,
          quantity, filled_quantity, remaining_quantity, client_order_id, time_in_force)
       VALUES ($1,$2,$3,$4,$5,'NEW',$6,$7,$8,0,$8,$9,$10)
       RETURNING *`,
      [
        id,
        input.userId,
        input.market.toUpperCase(),
        input.side,
        input.type,
        input.price ?? null,
        input.stopPrice ?? null,
        input.quantity,
        input.clientOrderId ?? null,
        timeInForce,
      ],
    );
    return rows.rows[0] ? rowToOrder(rows.rows[0]) : null;
  });

  if (!result.enabled || !result.value) {
    logger.error("[order-service] failed to create order", { input });
    return null;
  }

  const order = result.value;

  // Emit OrderCreated event.
  const event = createTradingEvent("OrderCreated", {
    orderId: order.id,
    userId: order.userId,
    market: order.market,
    side: order.side,
    type: order.type,
    price: order.price,
    quantity: order.quantity,
    timeInForce: order.timeInForce,
  });
  logger.info("[order-service] OrderCreated", {
    eventId: event.eventId,
    orderId: order.id,
    market: order.market,
    userId: order.userId,
  });

  // Persist event to order_events audit log.
  void withDb((client) =>
    client.query(
      `INSERT INTO order_events (order_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
      [order.id, "OrderCreated", JSON.stringify(event.payload)],
    ),
  );

  return order;
}

// ── Cancel order ──────────────────────────────────────────────────────────────

export async function cancelOrder(
  orderId: string,
  userId: string,
): Promise<{ cancelled: boolean; order: Order | null; reason?: string }> {
  const result = await withDb(async (client) => {
    // Only open orders owned by this user can be cancelled.
    const rows = await client.query(
      `UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2
         AND status IN ('NEW', 'PARTIALLY_FILLED')
       RETURNING *`,
      [orderId, userId],
    );
    return rows.rows[0] ? rowToOrder(rows.rows[0]) : null;
  });

  if (!result.enabled) {
    return { cancelled: false, order: null, reason: "storage_unavailable" };
  }
  if (!result.value) {
    return { cancelled: false, order: null, reason: "order_not_found_or_not_cancellable" };
  }

  const order = result.value;
  const event = createTradingEvent("OrderCancelled", {
    orderId: order.id,
    userId,
    market: order.market,
    cancelledBy: "user",
  });
  logger.info("[order-service] OrderCancelled", {
    eventId: event.eventId,
    orderId: order.id,
    market: order.market,
    userId,
  });
  void withDb((client) =>
    client.query(
      `INSERT INTO order_events (order_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
      [order.id, "OrderCancelled", JSON.stringify(event.payload)],
    ),
  );

  return { cancelled: true, order };
}

// ── Query orders ──────────────────────────────────────────────────────────────

export type OrderQueryOptions = {
  userId: string;
  market?: string;
  status?: OrderStatus;
  limit?: number;
};

export async function listOrders(options: OrderQueryOptions): Promise<Order[]> {
  const result = await withDb(async (client) => {
    const params: unknown[] = [options.userId];
    const conditions: string[] = ["user_id = $1"];

    if (options.market) {
      params.push(options.market.toUpperCase());
      conditions.push(`market = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }

    const limit = Math.min(options.limit ?? 50, 200);
    params.push(limit);

    const rows = await client.query(
      `SELECT * FROM orders
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.rows.map(rowToOrder);
  });

  if (!result.enabled) return [];
  return result.value ?? [];
}

export async function getOrder(orderId: string, userId: string): Promise<Order | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT * FROM orders WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
      [orderId, userId],
    );
    return rows.rows[0] ? rowToOrder(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}
