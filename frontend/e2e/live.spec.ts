import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import axe from "axe-core";
import { createHmac } from "node:crypto";

const backend = resolve(process.cwd(), "../backend");
const python = process.env.E2E_PYTHON ?? resolve(backend, ".venv/bin/python");
const password = "Live-test-password-Cedar-4709!";
let server: ChildProcess;
let root: string;
let origin: string;
let fixture: { application: string; reference: string; document: string };
let serverLog = "";

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}

test.describe("Real Django workflow", () => {
  test.describe.configure({ mode: "serial", timeout: 90000 });
  test.beforeAll(async () => {
    test.setTimeout(120000);
    root = mkdtempSync(resolve(tmpdir(), "enrollchain-live-"));
    const env = {
      ...process.env,
      ENROLLCHAIN_E2E_ROOT: root,
      DJANGO_DEBUG: "true",
      BLOCKCHAIN_LOCAL_CONFIG: "false",
      DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost,testserver",
      CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
      DATABASE_URL: `sqlite:///${root}/test.sqlite3`,
      PRIVATE_MEDIA_ROOT: `${root}/private-media`,
      PYTHONPATH: backend,
    };
    const result = execFileSync(python, ["tests/live_seed.py"], {
      cwd: backend,
      env,
      encoding: "utf8",
      timeout: 90000,
    });
    fixture = JSON.parse(result.trim().split("\n").at(-1)!) as typeof fixture;
    const socket = createServer();
    await new Promise<void>((resolve) =>
      socket.listen(0, "127.0.0.1", resolve),
    );
    const address = socket.address();
    if (!address || typeof address === "string")
      throw new Error("Cannot allocate test port");
    const port = address.port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    origin = `http://127.0.0.1:${port}`;
    server = spawn(
      python,
      ["manage.py", "runserver", `127.0.0.1:${port}`, "--noreload"],
      { cwd: backend, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stderr?.on("data", (chunk) => {
      serverLog = (serverLog + String(chunk)).slice(-5000);
    });
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${origin}/api/v1/health/`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 20000, message: "Isolated Django server did not start" },
      )
      .toBe(200);
  });
  test.afterAll(async () => {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });
  test.beforeEach(async ({ page }) => {
    // Forward requests to the real isolated API; no response fixtures or API mocks.
    await page.route("**/api/v1/**", (route) =>
      route.continue({
        url: `${origin}/api/v1/${route.request().url().split("/api/v1/")[1]}`,
      }),
    );
  });
  async function signIn(page: Page, role: string, code = "") {
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${role}@live.example.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    if (code)
      await page.getByLabel("Authentication or recovery code").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  test("staff directory and applicant profile use distinct layouts", async ({
    page,
  }, testInfo) => {
    await signIn(page, "registrar");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/learners");
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "View Ana Cruz" }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to records" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "applicant");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/learners");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "My Profile",
    );
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Edit profile",
    );
    await expect(
      page.getByRole("button", { name: "Edit profile" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "My Profile",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("applicant-profile-mobile.png"),
      fullPage: true,
    });
    await page.goto("/applications");
    await expect(
      page.getByRole("link", { name: "View application" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "New Application" }),
    ).toHaveCount(0);
  });
  test("registrar previews the private PDF, requests a correction, and applicant replaces it", async ({
    page,
  }) => {
    await signIn(page, "registrar");
    await expect(page).toHaveURL(/dashboard/);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Document Review", exact: true })
      .click();
    await page
      .getByRole("button", { name: "View Documents for Ana Cruz" })
      .click();
    await page
      .getByRole("button", { name: /^Review .* for Ana Cruz$/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Review document" });
    await dialog
      .getByRole("button", { name: "Preview PDF", exact: true })
      .click();
    await expect(
      dialog.getByRole("status").filter({ hasText: "Page 1 of 2" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        dialog
          .locator("canvas")
          .evaluate((canvas) =>
            canvas instanceof HTMLCanvasElement ? canvas.width : 0,
          ),
      )
      .toBeGreaterThan(300);
    await dialog.getByText("Accessible page text", { exact: true }).click();
    await expect(
      dialog.getByText("Synthetic review document - page 1", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next PDF page" }).click();
    await expect(
      dialog.getByText("Synthetic review document - page 2", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(dialog.getByText("125%", { exact: true })).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    const accessibility = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      }),
    );
    expect(accessibility.violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({
      path: "/tmp/enrollchain-private-pdf-review.png",
      fullPage: true,
    });
    await dialog.getByRole("radio", { name: /Request a correction/ }).check();
    await dialog
      .getByRole("textbox", { name: "Remarks", exact: true })
      .fill("Please submit a clearer scan of page two.");
    await dialog.getByRole("button", { name: "Record decision" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "applicant");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/applications/${fixture.application}`);
    await expect(
      page
        .getByText("Please submit a clearer scan of page two.", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByLabel(/^PDF for /)).toHaveCount(1);
    await page
      .getByLabel(/^PDF for /)
      .setInputFiles(resolve(root, "replacement.pdf"));
    await page.getByRole("button", { name: /Upload/ }).click();
    await expect(page.getByLabel(/^PDF for /)).toHaveCount(0);
    await expect(page.getByText(/Version 2/)).toBeVisible();
    await expect(
      page.getByText(/Upload missing requirements below/),
    ).toBeVisible();
    expect(serverLog).not.toContain("Traceback");
  });
  test("administrator sees preview audit and configuration, but cannot access superadmin", async ({
    page,
  }) => {
    await signIn(page, "administrator");
    await expect(page).toHaveURL(/administration$/);
    await page.getByRole("link", { name: "Audit Logs", exact: true }).click();
    await page.getByLabel("Action", { exact: true }).fill("PREVIEW_DOCUMENT");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByRole("heading", { name: "PREVIEW DOCUMENT" }).first(),
    ).toBeVisible();
    await page.goto("/superadmin");
    await expect(page.getByRole("alert")).toContainText(
      "Superadministrator access is required",
    );
    await page.goto("/administration/configuration");
    await expect(
      page.getByText("Live test school year", { exact: true }),
    ).toBeVisible();
  });
  test("verified documents and guidance lead to section assignment, then manual LIS confirmation", async ({
    page,
  }) => {
    await signIn(page, "registrar");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/reviews");
    await page
      .getByRole("button", { name: "View Documents for Ana Cruz" })
      .click();
    for (let i = 0; i < 4; i++) {
      await page
        .getByRole("button", { name: /^Review .* for Ana Cruz/ })
        .first()
        .click();
      await page.getByRole("radio", { name: /^Verify document/ }).check();
      await page
        .getByRole("button", { name: "Record decision", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.goto(`/applications/${fixture.application}`);
    await expect(
      page.getByRole("button", { name: "Mark qualified", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "guidance");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/enrollments/${fixture.application}`);
    await page
      .getByLabel("Private interview notes")
      .fill("Completed synthetic interview.");
    await page
      .getByRole("button", { name: "Record Completed Interview", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Record Completed Interview",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "registrar");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/applications/${fixture.application}`);
    await page
      .getByRole("button", { name: "Mark qualified", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirm pre-enrollment & assign section",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Synthetic live section", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mark ready for LIS", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Record submission to LIS", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Confirm LIS registration & official enrollment",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Remarks / reason / LIS confirmation evidence")
      .fill("Synthetic acceptance test only.");
    await expect(
      page.getByLabel("Remarks / reason / LIS confirmation evidence"),
    ).toHaveValue("Synthetic acceptance test only.");
    await page
      .getByRole("button", {
        name: "Confirm LIS registration & official enrollment",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Officially enrolled", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "adviser");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/sections");
    await page
      .getByRole("button", { name: "View roster", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Ana Cruz", exact: true }),
    ).toBeVisible();
    expect(serverLog).not.toContain("Traceback");
  });
  test("QR destination survives sign-in and enforces document ownership", async ({
    page,
  }) => {
    const destination = `/verify-documents/${fixture.document}`;
    await page.goto(destination);
    await expect(page).toHaveURL(/login/);
    await page
      .getByLabel("Email", { exact: true })
      .fill("registrar@live.example.test");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(destination));
    await expect(
      page.getByRole("heading", { name: "Document Verification", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show QR Code" }).click();
    const qr = page.getByRole("img", { name: /QR code linking/ });
    await expect(qr).toBeVisible();
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Check stored PDF" }).click();
    await expect(page.getByText("File matches the record")).toBeVisible();
    await page.evaluate(axe.source);
    expect(
      await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => v.id),
      ),
    ).toEqual([]);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "other");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(destination);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show QR Code" }),
    ).toHaveCount(0);
  });
  test("MFA enrollment revokes sessions and a one-use recovery code signs in", async ({
    page,
  }) => {
    await signIn(page, "other");
    await expect(page).toHaveURL(/dashboard/);
    await page
      .getByRole("link", { name: "Account Security", exact: true })
      .click();
    await page.getByLabel("Security action").selectOption("enroll");
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const key = await page.locator("p.select-all").textContent();
    if (!key) throw new Error("No enrollment key");
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page
      .getByLabel("Authentication or recovery code", { exact: true })
      .fill(totp(key.trim()));
    const confirmation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/accounts/security/") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirm and enable MFA" }).click();
    expect((await confirmation).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Security updated" }),
    ).toBeVisible();
    const recovery = await page.locator("li.select-all").first().textContent();
    if (!recovery) throw new Error("No recovery code");
    await page.getByRole("link", { name: "Return to sign in" }).click();
    await signIn(page, "other");
    await expect(
      page.getByLabel("Authentication or recovery code"),
    ).toBeVisible();
    await page.getByLabel("Authentication or recovery code").fill(recovery);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/applications/${fixture.application}`);
    await expect(page.getByRole("alert")).toContainText(
      /not found|No Application matches/i,
    );
  });
});
