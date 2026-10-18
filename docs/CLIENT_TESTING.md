# Client testing with Docker

This isolated stack is for synthetic client acceptance testing. EnrollChain handles early enrollment, document review, preliminary sectioning and reporting. DepEd LIS remains the official enrollment system. LIS submission/confirmation here is recorded manually; no LIS API connection is claimed.

## Start

From the repository root, with Docker Desktop running:

```sh
python3 scripts/prepare-client-test.py
docker compose --env-file .env.client -f compose.client.yml up --build -d
docker compose --env-file .env.client -f compose.client.yml ps
```

Open **http://localhost:8080**. The first build downloads dependencies and compiles the contracts. Wait for the services to become healthy.

Passwords and six account IDs are in **`.client-test/LOGIN_ACCOUNTS.md`**. This file and `.env.client` are private and ignored by Git. Staff credentials are unchanged. The retired learner demo and its files have been removed; the new learner account starts without a profile. Re-running preparation/startup preserves existing credentials and records. The Docker client database starts separately, with no real learners.

Accounts: `superadmin@enrollchain.test`, `admin@enrollchain.test`, `registrar@enrollchain.test`, `learner@enrollchain.test`, `guidance@enrollchain.test`, `adviser@enrollchain.test`. Each has its own generated password. Do not reuse the older local-demo password in this stack.

Synthetic programs/sections are visibly prefixed **DEMO** and exist only to exercise the workflow. They are not the school's confirmed strand offerings. Use School configuration and Sections to configure the client's actual programs when confirmed.

## Forward one port

Forward the **web port 8080 only**. Frontend requests use `/api/v1` on the same origin, so the client never needs access to localhost:8000. Database, backend and blockchain ports are not published.

For an HTTPS forwarding/tunnel service that connects to localhost:8080, add its exact hostname (without scheme or port) to `DJANGO_ALLOWED_HOSTS` in `.env.client`, retaining `localhost,127.0.0.1,backend`. Then apply:

```sh
docker compose --env-file .env.client -f compose.client.yml up -d
```

For LAN/router forwarding, set `CLIENT_BIND_ADDRESS=0.0.0.0` and add the actual hostname/IP to `DJANGO_ALLOWED_HOSTS`. Prefer an HTTPS forwarding URL for remote login and document testing. Do not expose the development Compose ports or Hardhat RPC. The test stack is prepared locally; no tunnel or public router rule is created automatically.

## End-to-end test

1. **Administrator:** Sign in, inspect School configuration → year, period, tracks, programs and requirement assignments. Open Sections and inspect capacity defaults (Academic40, TechPro25), program/grade match and adviser. Provision any additional learner using Users & access; deliver that account's initial password privately.
2. **Learner:** Sign in → My profile → Complete my profile. Provide education information as well as personal information. A login owns one profile. LRN is optional but must be12digits when provided. Start a new application, select period/grade/track/program and save. Submit early enrollment, then upload the configured PDF requirements (maximum30MiB each).
3. **Registrar:** Open Document review. Preview the PDF in the system. Request a correction or reject one version with remarks. Verify another version. Duplicate content is a review flag, not an automatic fraud verdict.
4. **Learner:** Open My enrollment. Read remarks, upload a replacement for the rejected/correction-requested document. Old versions remain visible. Verified versions cannot be replaced.
5. **Registrar:** Verify every mandatory latest PDF. Qualification remains blocked until a Guidance Officer records a completed interview.
6. **Guidance Officer:** Open Guidance interviews and the learner's application; record interview completion. Private interview notes are not shown to the learner. Guidance cannot make document decisions.
7. **Registrar:** Mark qualified, then confirm pre-enrollment. A matching section is selected automatically. If all matching sections are full, the learner remains pre-enrolled and waiting for a section. Manual assignment/transfer/removal requires a reason and cannot exceed capacity.
8. **Class Adviser:** Open My sections → roster. Only sections assigned to that adviser are visible; private PDFs are not accessible.
9. **Registrar:** Mark ready for LIS, record submission to LIS, then enter confirmation evidence and optionally a LIS reference. Confirm LIS registration. Only this confirmation produces officially enrolled status. Use synthetic evidence for testing, never claim the test record exists in real LIS.
10. **Learner:** Check assigned section, guidance completion, enrollment stage and LIS status.
11. **Registrar/Admin:** Open Reports, apply filters, export CSV and PDF. Open Blockchain verification: confirmed events show real local-chain transaction hashes and blocks. A pending/failed record is not a successful blockchain proof.
12. **Administrator:** Check Audit logs for upload, review, section and LIS actions. Superadministrator uses System settings for operational status and additional individual permission grants. `/admin/` is not exposed.
13. **Security:** MFA code input appears only after valid password authentication for an enabled account. Enable MFA in Account security, save the one-time recovery codes privately, and test a fresh login. Changes revoke old sessions.

## Validation and screenshots

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/enrollchain-playwright node scripts/client-smoke.mjs
```

Requires the frontend's installed Playwright Chromium. Checks all available role pages through Docker's web port, accessibility rules, errors and mobile overflow. Screenshots and results are saved in `.client-test/`, not committed. Run this before enabling MFA on the test accounts; automated login intentionally does not bypass MFA.

## Stop, logs and persistence

```sh
docker compose --env-file .env.client -f compose.client.yml logs --tail=100 backend worker web
docker compose --env-file .env.client -f compose.client.yml stop
docker compose --env-file .env.client -f compose.client.yml up -d
```

PostgreSQL and private PDFs use named volumes. Do not use `down -v` unless intentionally deleting client-test data. The local Hardhat chain is a demonstration network and restarts without persistent chain history. The worker detects missing local proofs, audits the previous transaction identity and re-anchors records. Production blockchain persistence/custody, real-data hosting and production operational security still require deployment decisions. Keep `.env.client` and its MFA key stable.

## Current UI and Demo Reset

The canonical self-service role is **LEARNER**. Migration `accounts.0005` migrates existing roles/groups and revokes old learner sessions. Sign in again after upgrading. The legacy `/learners/{id}/link-applicant/` URL remains compatible; its account selection accepts learner accounts.

The explicitly requested reset removed the retired demo learner, application, private PDFs and both former demo login accounts. Other users and unrelated records were retained. Use `learner@enrollchain.test` with the new password in `.client-test/LOGIN_ACCOUNTS.md`. Complete a fresh profile to begin testing.

Check these interactions before client handoff:

- Open Notifications from every role; verify the unread badge, Mark All Read and delete controls.
- Registrar/Admin: Learner Records → View opens a tabbed record dialog; editing uses the profile form.
- Sections → Create Section opens a dialog. Cancel and Escape return to the section list.
- Learner: New Application has a Back to Early Enrollment button; an existing pending application prevents a second new application.
- Table sort arrows appear on hover or keyboard focus. Sorting remains available with the keyboard.
- Guidance: open a submitted learner record and Record Completed Interview. Only the completion indicator is visible to the learner.

Apply migrations when running outside Docker, including the notification table:

```sh
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_admissions_roles
```

## Latest Validation — October 5, 2026

The client backend, worker and web images were rebuilt and started using the existing database, upload and runtime volumes. The running client blockchain node was retained. A private pre-upgrade database/file/runtime backup is in `.client-test/backups/preflight-20261005-204010/`.

- **111 backend tests passed inside the rebuilt Docker image**, using a separate PostgreSQL instance and separate real EVM node. This includes concurrent section-capacity enforcement, authorized issuer/conflicting-proof checks, and document hash match/mismatch. No tests were skipped in this run.
- The local SQLite run passed 109 tests with the two environment-specific tests skipped; those tests passed in the Docker run above.
- Ruff, Django system checks, migration consistency and strict OpenAPI validation passed, including checks within the deployed backend.
- Frontend lint, production build, 20 unit tests and 10 browser workflow tests passed.
- 43 Docker role/page checks passed across six accounts, with notification dialogs, automated accessibility rules and mobile overflow checks.
- PDF preview/page navigation, section dialog/Escape, sort hover/focus and Sign Out cursor checks passed.
- All 12 reports returned JSON, CSV and PDF successfully through the web proxy. All four existing private document previews matched stored SHA-256 hashes. Both existing verified documents matched their confirmed on-chain hashes.
- Fresh migrations and rollback/reapplication of the latest account/classification migrations passed in an isolated database.
- Both Solidity contracts compiled afresh with solc 0.8.28; Compose configuration passed validation.
- Six accounts, one learner, one application and four document records were retained. All six existing passwords matched the private account sheet; no password/MFA reset was performed. Registrar provisioning permissions and one currently open admission period were confirmed.

The stack is available at `http://localhost:8080`. Only port 8080 is published. A public forwarded URL was not supplied during this validation; verify its hostname and allowlist before sharing it with the client. Test results apply to this build, not a claim of production readiness. No commit or push was performed.

## Use the Same Demo Accounts Locally

The six demo accounts can be provisioned into the local development database using the same private account file as Docker:

```sh
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_admissions_roles
.venv/bin/python manage.py seed_client_test --accounts-only --sync-existing --accounts-file ../.client-test/accounts.json
```

This explicitly synchronizes the six named demo accounts’ passwords, roles and active state. Changed accounts have old sessions revoked. MFA settings, learner profiles, applications, unrelated accounts and school configuration are preserved. Local account-only seeding requires development mode; normal Docker startup continues to preserve existing passwords. The September 19 synchronization supersedes the previous differing local staff passwords. Use `.client-test/LOGIN_ACCOUNTS.md` for both environments.

Learner application forms show the signed-in learner’s fixed identity. Only authorized staff have a learner selector. The backend also rejects another learner’s ID if a request is manually altered.

## Registrar Account Creation and Balik-Aral

After upgrading, run `python manage.py migrate` and `python manage.py setup_admissions_roles` in the backend environment, then sign out/in to refresh menu permissions. Docker startup runs these commands when the updated images are deployed; source changes alone do not update an existing Docker image.

Registrar → Learner & Teacher Accounts → Create Account permits Learner or Teacher / Class Adviser. Confirm with the Registrar’s own current password and MFA when enabled. Existing learner profile creation/linking remains in Learner Records. Account editing and other staff-role provisioning remain with administration. Class Adviser is the current interpretation of teacher pending client clarification.

Application creation/editing offers New, Balik-Aral and Transferee, with Grade 11 or Grade 12. Early Enrollment and reports can filter by grade and classification together. Balik-Aral uses the existing RETURNING code; existing data and requirement rules are retained.
