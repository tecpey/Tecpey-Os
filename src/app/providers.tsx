"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {useSocket} from "@/hooks/useSocket";
import { OfflineSyncManager } from "@/components/offline/OfflineSyncManager";


const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {

  useSocket();
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <OfflineSyncManager />
    </QueryClientProvider>
  );
}
