"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import type { MarketScalar } from "@/types/market";

type FiatTicker = {
  last?: MarketScalar;
};

type FiatTickerPayload = {
  data?: FiatTicker;
};

export const useUsdPrice = () => {
  const [data, setData] = useState<FiatTicker | null>(null);

  useEffect(() => {
    const emit = "fiat:USDT_IRT";

    const message = {
      pair: "USDT_IRT",
    };

    const handler = (payload: FiatTickerPayload) => {
      setData(payload.data ?? null);
    };

    socket.on(emit, handler);

    socket.emit(`subscribe:${emit}`, message);

    return () => {
      socket.off(emit, handler);

      socket.emit(`unsubscribe:${emit}`, message);
    };
  }, []);

  return data?.last ?? 0;
};
