import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { queryClient } from "../lib/queryClient";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ErrorBoundary>
  );
}
