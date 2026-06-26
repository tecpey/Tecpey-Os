"use client";

import { useCallback, useEffect, useState } from "react";

import { socket } from "@/lib/socket";

export const useSocketioMarketPriceSpot = (
  pair: string[]
) => {

  const [data, setData] =
    useState<any>(null);

  const handler = useCallback(
    (payload: any) => {
      setData(payload);
    },
    []
  );

  useEffect(() => {

    if (!pair.length) return;

    socket.on(
      "pair:price",
      handler
    );

    socket.emit(
      "subscribe:pair:price",
      {
        pair,
      }
    );

    return () => {

      socket.off(
        "pair:price",
        handler
      );

      socket.emit(
        "unsubscribe:pair:price",
        {
          pair,
        }
      );
    };

  }, [pair, handler]);

  return data?.data;
};