import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import type { Document, ReviewDecision } from "../src/lib/admissions";

declare global {
  interface Window {
    axe: typeof axe;
  }
}

const registrarPermissions = [
  "view_documentsubmission",
  "view_documentreview",
  "review_document",
  "view_application",
  "view_learner",
].map((permission) => `admissions.${permission}`);
const initialDocument: Document = {
  id: "document-1",
  application: "application-1",
  requirement: 1,
  requirement_name: "Report Card / SF9",
  original_filename: "report-card.pdf",
  version: 1,
  uploaded_at: "2026-09-12T08:00:00Z",
  sha256: "a".repeat(64),
  file_size: 1000,
  review: null,
  review_status: "PENDING",
  is_latest: true,
  application_reference: "APP-DEVELOPMENT-001",
  learner_name: "Ana Cruz",
  period_name: "Senior High School admission",
};

async function mockWorkspace(
  page: Page,
  role = "REGISTRAR",
  options: { failReview?: boolean; correction?: boolean } = {},
) {
  let document: Document = { ...initialDocument };
  if (options.correction)
    document = {
      ...document,
      review_status: "RESUBMISSION_REQUESTED",
      review: {
        id: "review-1",
        decision: "RESUBMISSION_REQUESTED",
        remarks: "Please include all pages.",
        reviewed_at: "2026-09-12T09:00:00Z",
        reviewer_name: "School Registrar",
      },
    };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "enrollchain-session",
      JSON.stringify({ access: "test-access", refresh: "test-refresh" }),
    ),
  );
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/accounts/me/"))
      return route.fulfill({
        json: {
          id: "user-1",
          email: "test@example.test",
          role,
          permissions: role === "LEARNER" ? [] : registrarPermissions,
        },
      });
    if (path.endsWith("/review-queue/")) {
      const filter = url.searchParams.get("status") ?? "PENDING";
      const search = url.searchParams.get("search") ?? "";
      const results =
        (filter === "ALL" || filter === document.review_status) &&
        (!search ||
          document.learner_name.toLowerCase().includes(search.toLowerCase()))
          ? [document]
          : [];
      return route.fulfill({
        json: {
          count: results.length,
          results:
            url.searchParams.get("group") === "application"
              ? results.map((d) => ({
                  application: d.application,
                  reference: d.application_reference,
                  learner_name: d.learner_name,
                  period_name: d.period_name,
                  document_count: 1,
                  uploaded_at: d.uploaded_at,
                }))
              : results,
          next: null,
          previous: null,
        },
      });
    }
    if (path.endsWith("/review/")) {
      if (options.failReview)
        return route.fulfill({
          status: 400,
          json: ["A newer document version exists. Refresh the review queue."],
        });
      const body = route.request().postDataJSON() as {
        decision: ReviewDecision;
        remarks: string;
      };
      document = {
        ...document,
        review_status: body.decision,
        review: {
          id: "review-1",
          decision: body.decision,
          remarks: body.remarks,
          reviewed_at: "2026-09-12T09:00:00Z",
          reviewer_name: "School Registrar",
        },
      };
      return route.fulfill({ json: document });
    }
    if (path.endsWith("/applications/application-1/"))
      return route.fulfill({
        json: {
          id: "application-1",
          reference: "APP-DEVELOPMENT-001",
          learner: "learner-1",
          learner_name: "Ana Cruz",
          period_name: "Senior High School admission",
          program_name: null,
          admission_period: 1,
          grade_level: 11,
          track: "ACADEMIC",
          program: null,
          classification: "NEW",
          source: "ONLINE",
          status: "SUBMITTED",
          created_at: "2026-09-12T08:00:00Z",
          submitted_at: "2026-09-12T09:00:00Z",
        },
      });
    if (path.endsWith("/requirements/"))
      return route.fulfill({
        json: [
          {
            id: 1,
            name: "Report Card / SF9",
            is_required: true,
            uploaded: true,
            review_status: document.review_status,
            can_upload: document.review_status === "RESUBMISSION_REQUESTED",
            latest_document: document.id,
          },
        ],
      });
    if (path.endsWith("/documents/") && route.request().method() === "GET")
      return route.fulfill({ json: [document] });
    if (path.endsWith("/documents/") && route.request().method() === "POST") {
      document = {
        ...document,
        id: "document-2",
        version: 2,
        review: null,
        review_status: "PENDING",
      };
      return route.fulfill({ status: 201, json: document });
    }
    return route.fulfill({
      status: 404,
      json: { detail: "Unmocked test endpoint" },
    });
  });
}

async function checkAccessibility(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test("queue and review dialog support keyboard navigation and accessible semantics", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/reviews");
  await page
    .getByRole("button", { name: "View Documents for Ana Cruz" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Report Card / SF9" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/enrollchain-review-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await checkAccessibility(page);
  const trigger = page.getByRole("button", {
    name: "Review Report Card / SF9 for Ana Cruz",
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Review document" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await checkAccessibility(page);
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("registrar requests a correction and sees the recorded decision", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/reviews");
  await page
    .getByRole("button", { name: "View Documents for Ana Cruz" })
    .click();
  await page
    .getByRole("button", { name: "Review Report Card / SF9 for Ana Cruz" })
    .click();
  await page.getByRole("radio", { name: /Request a correction/ }).check();
  await expect(
    page.getByRole("button", { name: "Record decision" }),
  ).toBeDisabled();
  await page
    .getByLabel("Remarks", { exact: true })
    .fill("Please include all pages.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#review-queue-heading")).toBeFocused();
  await page.getByRole("button", { name: "Corrections", exact: true }).click();
  await page
    .getByRole("button", { name: "View Documents for Ana Cruz" })
    .click();
  await expect(page.getByText("Please include all pages.")).toBeVisible();
  await expect(
    page.getByText("Correction requested", { exact: true }),
  ).toBeVisible();
});

test("stale review errors retain remarks and keep the dialog open", async ({
  page,
}) => {
  await mockWorkspace(page, "REGISTRAR", { failReview: true });
  await page.goto("/reviews");
  await page
    .getByRole("button", { name: "View Documents for Ana Cruz" })
    .click();
  await page
    .getByRole("button", { name: "Review Report Card / SF9 for Ana Cruz" })
    .click();
  await page.getByRole("radio", { name: /Request a correction/ }).check();
  await page
    .getByLabel("Remarks", { exact: true })
    .fill("Please include all pages.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("alert")).toContainText("newer document version");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Remarks", { exact: true })).toHaveValue(
    "Please include all pages.",
  );
});

test("administrator has oversight without decision controls on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page, "ADMINISTRATOR");
  await page.goto("/reviews");
  await page
    .getByRole("button", { name: "View Documents for Ana Cruz" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Report Card / SF9" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Review Report Card/ }),
  ).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "/tmp/enrollchain-review-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await checkAccessibility(page);
});

test("applicant can replace only a document flagged for correction", async ({
  page,
}) => {
  await mockWorkspace(page, "LEARNER", { correction: true });
  await page.goto("/applications/application-1");
  await expect(page.getByText("Please include all pages.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit draft choices" }),
  ).toHaveCount(0);
  await page
    .getByLabel("PDF for Report Card / SF9", { exact: true })
    .setInputFiles({
      name: "replacement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-test-fixture"),
    });
  await page.getByRole("button", { name: "Upload new version" }).click();
  await expect(
    page.getByRole("button", { name: "Upload new version" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Upload missing requirements below/),
  ).toBeVisible();
  await expect(page.getByText("Version 2", { exact: false })).toBeVisible();
});
