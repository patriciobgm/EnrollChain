import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { setTokens } from "../lib/api";

const user = {
  id: "user-1",
  email: "learner@example.com",
  role: "APPLICANT",
  permissions: [],
};
const learner = {
  id: "learner-1",
  first_name: "Ana",
  last_name: "Cruz",
  lrn: "123456789012",
  age: 18,
};
const application = {
  id: "app-1",
  learner: learner.id,
  learner_name: "Ana Cruz",
  reference: "APP-123",
  grade_level: 11,
  track: "ACADEMIC",
  classification: "NEW",
  source: "ONLINE",
  status: "DRAFT",
  created_at: "2026-09-11T00:00:00Z",
  submitted_at: null,
};
const requirement = {
  id: 1,
  name: "Report Card / SF9",
  is_required: true,
  uploaded: false,
};
const periods = [
  {
    id: 1,
    name: "SHS admission",
    is_active: true,
    opens_on: "2026-01-01",
    closes_on: "2026-12-31",
  },
];
const programs = [
  {
    id: 1,
    name: "Configured academic program",
    track: "ACADEMIC",
    is_active: true,
  },
  {
    id: 2,
    name: "Configured technical program",
    track: "TECHNICAL_PROFESSIONAL",
    is_active: true,
  },
];

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function mount(path: string, authenticated = true) {
  if (authenticated) setTokens({ access: "access", refresh: "refresh" });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={cache}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cache;
}
function mockApi(
  override?: (path: string, init?: RequestInit) => Response | undefined,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const path = String(input).split("/api/v1")[1];
      const custom = override?.(path, init);
      if (custom) return custom;
      const defaults: Record<string, unknown> = {
        "/accounts/me/": user,
        "/learners/": [learner],
        "/applications/": [application],
        "/applications/app-1/": application,
        "/applications/app-1/requirements/": [requirement],
        "/documents/?application=app-1": [],
        "/admission-periods/": periods,
        "/programs/": programs,
      };
      if (!(path in defaults)) throw new Error(`Unexpected request ${path}`);
      return response(defaults[path]);
    });
}

afterEach(() => {
  cleanup();
  setTokens(null);
  vi.restoreAllMocks();
});

describe("Milestone 1", () => {
  it("protects routes and reports login failures", async () => {
    mockApi((path) =>
      path === "/auth/token/"
        ? response({ detail: "No active account found" }, 401)
        : undefined,
    );
    mount("/applications", false);
    expect(
      await screen.findByRole("heading", { name: "Sign in to EnrollChain" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No active account found",
    );
  });
  it("logs in through JWT and displays application status", async () => {
    const fetch = mockApi((path) =>
      path === "/auth/token/"
        ? response({ access: "new-access", refresh: "new-refresh" })
        : undefined,
    );
    mount("/login", false);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("APP-123")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    const current = fetch.mock.calls.find(([path]) =>
      String(path).endsWith("/accounts/me/"),
    );
    expect(new Headers(current?.[1]?.headers).get("Authorization")).toBe(
      "Bearer new-access",
    );
  });
  it("refreshes expired access tokens and retries protected requests", async () => {
    let requests = 0;
    const fetch = mockApi((path) => {
      if (path === "/accounts/me/" && requests++ === 0)
        return response({ detail: "Expired" }, 401);
      if (path === "/auth/token/refresh/")
        return response({
          access: "rotated-access",
          refresh: "rotated-refresh",
        });
    });
    mount("/applications");
    expect(await screen.findByText("APP-123")).toBeInTheDocument();
    expect(
      fetch.mock.calls.filter(([path]) =>
        String(path).endsWith("/auth/token/refresh/"),
      ),
    ).toHaveLength(1);
    const calls = fetch.mock.calls.filter(([path]) =>
      String(path).endsWith("/accounts/me/"),
    );
    expect(new Headers(calls[1][1]?.headers).get("Authorization")).toBe(
      "Bearer rotated-access",
    );
  });
  it("hides application navigation from unassigned advisers", async () => {
    mockApi((path) =>
      path === "/accounts/me/"
        ? response({ ...user, role: "CLASS_ADVISER" })
        : undefined,
    );
    mount("/applications");
    expect(
      await screen.findByText(/Application access has not been assigned/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Learner profiles" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New application" }),
    ).not.toBeInTheDocument();
  });
  it("submits profile fields and preserves API validation errors", async () => {
    mockApi((path, init) =>
      path === "/learners/" && init?.method === "POST"
        ? response({ lrn: ["A learner with this LRN already exists."] }, 400)
        : undefined,
    );
    mount("/learners");
    fireEvent.click(
      await screen.findByRole("button", { name: "Add learner profile" }),
    );
    for (const [label, value] of [
      ["LRN", "123456789012"],
      ["First name", "Ana"],
      ["Last name", "Cruz"],
      ["Birthdate", "2008-01-05"],
      ["Sex", "Female"],
      ["Address", "Test address"],
      ["Contact number", "09123456789"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "LRN already exists",
    );
  });
  it("filters configurable programs by track and creates a draft", async () => {
    let body: Record<string, unknown> | undefined;
    mockApi((path, init) => {
      if (path === "/applications/" && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return response(application, 201);
      }
    });
    mount("/applications/new");
    const track = await screen.findByLabelText("Track");
    expect(
      screen.getByRole("option", { name: "Configured academic program" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Configured technical program" }),
    ).not.toBeInTheDocument();
    fireEvent.change(track, { target: { value: "TECHNICAL_PROFESSIONAL" } });
    fireEvent.change(screen.getByLabelText("Learner"), {
      target: { value: learner.id },
    });
    fireEvent.change(screen.getByLabelText("Admission period"), {
      target: { value: "1" },
    });
    fireEvent.change(
      screen.getByLabelText("Program / specialization (optional)"),
      { target: { value: "2" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("heading", { name: "Application details" });
    expect(body).toMatchObject({
      learner: learner.id,
      program: 2,
      track: "TECHNICAL_PROFESSIONAL",
      grade_level: 11,
      source: "ONLINE",
    });
  });
  it("validates PDFs, uploads multipart data, and enables submission", async () => {
    let uploaded = false;
    let submitted = false;
    let multipart: FormData | null = null;
    mockApi((path, init) => {
      if (path === "/documents/" && init?.method === "POST") {
        multipart = init.body as FormData;
        uploaded = true;
        return response({ id: "doc-1" }, 201);
      }
      if (path === "/applications/app-1/requirements/")
        return response([{ ...requirement, uploaded }]);
      if (path === "/applications/app-1/submit/") {
        submitted = true;
        return response({ ...application, status: "SUBMITTED" });
      }
      if (path === "/applications/app-1/" && submitted)
        return response({
          ...application,
          status: "SUBMITTED",
          submitted_at: "2026-09-11T01:00:00Z",
        });
    });
    mount("/applications/app-1");
    const input = await screen.findByLabelText(/PDF for Report Card/);
    expect(
      screen.getByRole("button", { name: "Submit application" }),
    ).toBeDisabled();
    let chosen = new File(["bad"], "bad.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [chosen] } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Select a PDF");
    chosen = new File(["%PDF-test"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(chosen, "size", { value: 30 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [chosen] } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 30 MB");
    chosen = new File(["%PDF-test"], "report.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [chosen] } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit application" }),
      ).toBeEnabled(),
    );
    expect((multipart as FormData | null)?.get("application")).toBe("app-1");
    expect((multipart as FormData | null)?.get("requirement")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    expect(await screen.findByText("SUBMITTED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upload new version" }),
    ).not.toBeInTheDocument();
  });
  it("clears session and cached private data on logout", async () => {
    mockApi((path) =>
      path === "/auth/logout/"
        ? new Response(null, { status: 204 })
        : undefined,
    );
    const cache = mount("/applications");
    await screen.findByText("APP-123");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in to EnrollChain" }),
    ).toBeInTheDocument();
    expect(cache.getQueryData(["applications"])).toBeUndefined();
    expect(sessionStorage.getItem("enrollchain-session")).toBeNull();
  });
  it("returns to sign-in when the refresh token expires", async () => {
    mockApi((path) => {
      if (path === "/accounts/me/" || path === "/auth/token/refresh/")
        return response({ detail: "Session expired" }, 401);
    });
    mount("/applications");
    expect(
      await screen.findByRole("heading", { name: "Sign in to EnrollChain" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("enrollchain-session")).toBeNull();
  });
  it("shows empty configuration and prevents saving an unusable draft", async () => {
    mockApi((path) =>
      path === "/admission-periods/" || path === "/learners/"
        ? response([])
        : undefined,
    );
    mount("/applications/new");
    expect(
      await screen.findByText(/No active admission periods/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Add a learner profile" }),
    ).toBeInTheDocument();
  });
  it("shows an application loading error without inventing an empty result", async () => {
    mockApi((path) =>
      path === "/applications/"
        ? response({ detail: "Applications unavailable" }, 503)
        : undefined,
    );
    mount("/applications");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Applications unavailable",
    );
    expect(screen.queryByText("No applications yet")).not.toBeInTheDocument();
  });
});
