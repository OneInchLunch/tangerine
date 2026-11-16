import { AuthProvider } from "@/auth/auth-context";
import { queryClient } from "@/lib/query-client";
import { loadConfig, setConfig } from "@/lib/config";
import { createAppRouter } from "@/router";
import { ThemeProvider, applyInitialTheme } from "@/theme/theme-provider";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

async function bootstrap() {
  const config = await loadConfig();
  setConfig(config);
  applyInitialTheme();
  const router = createAppRouter(config);

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element not found");
  }

  createRoot(container).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();
