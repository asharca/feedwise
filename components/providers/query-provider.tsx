"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/query/api";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSE events invalidate what changed; no need to refetch on every focus.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (401/404/400) won't fix themselves on retry.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
