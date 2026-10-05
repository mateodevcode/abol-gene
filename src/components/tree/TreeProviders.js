'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** TanStack Query: caché de ramas del árbol por foco y profundidad. */
export default function TreeProviders({ children }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
