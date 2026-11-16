import { ApiError } from "@/api/client";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * AuthProvider registers a handler so any query or mutation that receives a 401
 * clears the session instead of leaving the user on an error panel.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function handleApiError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    unauthorizedHandler?.();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403 || error.status === 404) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
