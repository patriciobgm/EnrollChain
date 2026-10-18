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
  role: "LEARNER",
  permissions: [],
};
const learner = {
  id: "learner-1",
  first_name: "Ana",
  last_name: "Cruz",
  lrn: "123456789012",
  age: 18,
  previous_school: "Test",
  last_grade_completed: 10,
  school_year_completed: "2025-2026",
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
  enrollment_status: "DRAFT",
  track_name: "Academic",
  eligibility: {
    ready: false,
    profile_missing: [],
    pending_requirements: [],
    guidance_completed: false,
    track_and_program_valid: true,
  },
  section_assignment: null,
  lis_record: null,
  guidance_completed: false,
  enrollment_events: [],
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
        "/accounts/dashboard/": {
          learners: 1,
          applications: 1,
          submitted: 0,
          documents: 0,
          reviews: 0,
          users: null,
          audit_events: null,
          active_periods: 1,
        },
        "/learners/": [learner],
        "/applications/": [application],
        "/applications/app-1/": application,
        "/applications/app-1/requirements/": [requirement],
        "/documents/?application=app-1": [],
        "/admission-periods/": periods,
        "/programs/": programs,
      };
      if (path === "/enrollments/?pending=true")
        return response({ count: 0, next: null, previous: null, results: [] });
      if (path.startsWith("/enrollments/?"))
        return response({
          count: 1,
          next: null,
          previous: null,
          results: [application],
        });
      if (path === "/enrollments/app-1/") return response(application);
      if (path === "/enrollment-metrics/")
        return response({
          total: 0,
          categories: {},
          statuses: {},
          unassigned: 0,
          lis: {},
          tracks: {},
          sections: [],
        });
      if (path === "/tracks/")
        return response([
          { code: "ACADEMIC", name: "Academic", active: true },
          {
            code: "TECHNICAL_PROFESSIONAL",
            name: "Technical Professional",
            active: true,
          },
        ]);
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
      await screen.findByRole("heading", { name: "Sign In" }),
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
    expect(
      (await screen.findAllByRole("link", { name: /My Enrollment/i }))[0],
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: /My Enrollment/i })[0]);
    expect(await screen.findByText("APP-123")).toBeInTheDocument();
    expect(screen.getAllByText("Draft")[0]).toBeInTheDocument();
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
        : path.startsWith("/enrollments/?")
          ? response(
              { detail: "Application access has not been assigned" },
              403,
            )
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
      screen.queryByRole("link", { name: "New Application" }),
    ).not.toBeInTheDocument();
  });
  it("hides new application and guards its direct URL while an application is pending", async () => {
    mockApi((path) =>
      path === "/enrollments/?pending=true"
        ? response({
            count: 1,
            next: null,
            previous: null,
            results: [application],
          })
        : undefined,
    );
    mount("/applications");
    await screen.findByRole("link", { name: "View application" });
    expect(
      screen.queryByRole("link", { name: "New Application" }),
    ).not.toBeInTheDocument();
    cleanup();
    mount("/applications/new");
    expect(
      await screen.findByRole("link", { name: "Continue application" }),
    ).toHaveAttribute("href", "/applications/app-1");
    expect(
      screen.queryByRole("button", { name: "Save draft" }),
    ).not.toBeInTheDocument();
  });
  it("replaces the applicant profile with an edit screen and restores it on cancel", async () => {
    mockApi();
    mount("/learners");
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Edit profile",
    );
    expect(
      screen.queryByRole("button", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "My Profile",
    );
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });
  it("paginates staff learner records and opens one profile at a time", async () => {
    const fetchMock = mockApi((path) => {
      if (path === "/accounts/me/")
        return response({
          ...user,
          role: "REGISTRAR",
          permissions: ["admissions.view_learner", "admissions.change_learner"],
        });
      if (path.startsWith("/learners/?")) {
        const second = path.includes("page=2");
        return response({
          count: 21,
          previous: second ? "page=1" : null,
          next: second ? null : "page=2",
          results: [
            {
              ...learner,
              id: second ? "learner-21" : learner.id,
              first_name: second ? "Bea" : "Ana",
              religion: "Private detail",
            },
          ],
        });
      }
    });
    mount("/learners");
    await screen.findByRole("button", { name: "View Ana Cruz" });
    expect(screen.queryByText("Private detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "View Bea Cruz" }),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Private detail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to records" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("page=2")),
    ).toBe(true);
  });
  it("shows applicant enrollment history without staff filters", async () => {
    mockApi((path) =>
      path.includes("archive=true")
        ? response({
            count: 1,
            next: null,
            previous: null,
            results: [
              {
                ...application,
                id: "past-1",
                reference: "APP-PAST",
                period_name: "Previous School Year",
                enrollment_status: "OFFICIALLY_ENROLLED",
              },
            ],
          })
        : undefined,
    );
    mount("/applications");
    await screen.findByRole("button", { name: "Enrollment History" });
    expect(screen.queryByLabelText("Enrollment stage")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search learner / reference"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enrollment History" }));
    expect(await screen.findByText("APP-PAST")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Officially Enrolled" }),
    ).toBeInTheDocument();
  });
  it("marks notifications read and clears the notification queue", async () => {
    let unread = 1;
    let count = 1;
    mockApi((path, init) => {
      if (path === "/accounts/notifications/count/")
        return response({ unread });
      if (path.startsWith("/accounts/notifications/?"))
        return response({
          count,
          next: null,
          previous: null,
          results: count
            ? [
                {
                  id: "notice-1",
                  title: "Document Verified",
                  link: "/applications/app-1",
                  created_at: "2026-09-13T00:00:00Z",
                  read_at: unread ? null : "2026-09-13T00:01:00Z",
                },
              ]
            : [],
        });
      if (
        path === "/accounts/notifications/read-all/" &&
        init?.method === "POST"
      ) {
        unread = 0;
        return response({ updated: 1 });
      }
      if (
        path === "/accounts/notifications/clear/" &&
        init?.method === "DELETE"
      ) {
        count = 0;
        return response({ deleted: 1 });
      }
    });
    mount("/applications");
    fireEvent.click(
      (
        await screen.findAllByRole("button", {
          name: "Notifications, 1 unread",
        })
      )[0],
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark All Read" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark All Read" }),
      ).toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete All Notifications" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete All" }));
    expect(await screen.findByText("No notifications.")).toBeInTheDocument();
  });
  it("submits profile fields and preserves API validation errors", async () => {
    mockApi((path, init) =>
      path === "/learners/" && init?.method === "POST"
        ? response({ lrn: ["A learner with this LRN already exists."] }, 400)
        : path === "/learners/"
          ? response([])
          : undefined,
    );
    mount("/learners");
    fireEvent.click(
      await screen.findByRole("button", { name: "Complete my profile" }),
    );
    for (const [label, value] of [
      ["LRN (if available)", "123456789012"],
      ["First name", "Ana"],
      ["Last name", "Cruz"],
      ["Birthdate", "2008-01-05"],
      ["Sex", "Female"],
      ["Address", "Test address"],
      ["Contact number", "09123456789"],
      ["Previous school", "Test school"],
      ["Last grade completed", "10"],
      ["School year completed", "2025-2026"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "LRN already exists",
    );
  });
  it("lets registrars open account creation with only learner and teacher choices", async () => {
    mockApi((path) => {
      if (path === "/accounts/me/")
        return response({
          ...user,
          role: "REGISTRAR",
          permissions: ["accounts.view_user", "accounts.add_user"],
        });
      if (path.startsWith("/accounts/users/?"))
        return response({ count: 0, results: [], next: null, previous: null });
    });
    mount("/administration/users");
    fireEvent.click(
      await screen.findByRole("button", { name: "Create account" }),
    );
    const role = screen.getByLabelText("Role");
    expect(
      Array.from((role as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual(["LEARNER", "CLASS_ADVISER"]);
    expect(
      screen.getByRole("option", { name: "Teacher / Class Adviser" }),
    ).toBeInTheDocument();
  });

  it("filters staff enrollment records by grade and Balik-Aral classification", async () => {
    const fetch = mockApi((path) =>
      path === "/accounts/me/"
        ? response({
            ...user,
            role: "REGISTRAR",
            permissions: ["admissions.view_application"],
          })
        : undefined,
    );
    mount("/applications");
    fireEvent.change(await screen.findByLabelText("Grade Level"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Learner Classification"), {
      target: { value: "RETURNING" },
    });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).includes("grade_level=12&classification=RETURNING"),
        ),
      ).toBe(true),
    );
    expect(
      screen.getByRole("option", { name: "Balik-Aral" }),
    ).toBeInTheDocument();
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
    fireEvent.change(track, { target: { value: "ACADEMIC" } });
    expect(
      screen.getByRole("option", { name: "Configured academic program" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Configured technical program" }),
    ).not.toBeInTheDocument();
    fireEvent.change(track, { target: { value: "TECHNICAL_PROFESSIONAL" } });
    expect(
      screen.queryByRole("combobox", { name: "Learner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ana Cruz")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Admission period"), {
      target: { value: "1" },
    });
    fireEvent.change(
      screen.getByLabelText("Cluster / strand / specialization"),
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
  it("blocks learner draft creation when the profile response is ambiguous", async () => {
    mockApi((path) =>
      path === "/learners/"
        ? response([learner, { ...learner, id: "other-learner" }])
        : undefined,
    );
    mount("/applications/new");
    expect(
      await screen.findByText(
        "Your account has conflicting profiles. Contact the Registrar.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(
      screen.queryByRole("combobox", { name: "Learner" }),
    ).not.toBeInTheDocument();
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
    ).toBeEnabled();
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
    await waitFor(() => expect(uploaded).toBe(true));
    expect((multipart as FormData | null)?.get("application")).toBe("app-1");
    expect((multipart as FormData | null)?.get("requirement")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    expect(
      await screen.findByText(/Upload missing requirements below/),
    ).toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "Sign In" }),
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
      await screen.findByRole("heading", { name: "Sign In" }),
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
      path.startsWith("/enrollments/?")
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
