"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export const usdPrice = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const emit = "fiat:USDT_IRT";

    const message = {
      pair: "USDT_IRT",
    };

    const handler = (payload: any) => {
      setData(payload.data);
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