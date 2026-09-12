import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the guarded foundation shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          database: "available",
          blockchain_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /secure admissions/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Foundation available")).toBeInTheDocument();
    expect(
      screen.getByText(/client-dependent modules remain deferred/i),
    ).toBeInTheDocument();
  });
});
