"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSocket } from "@/hooks/useSocket";
import { OfflineSyncManager } from "@/components/offline/OfflineSyncManager";


const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const shouldMountOfflineSync =
    pathname === "/academy" ||
    pathname.startsWith("/academy/") ||
    pathname === "/en/academy" ||
    pathname.startsWith("/en/academy/");

  useSocket();
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {shouldMountOfflineSync ? <OfflineSyncManager /> : null}
    </QueryClientProvider>
  );
}
