# Early enrollment release — delivery record

## 1. Existing workflow

Milestones1–2 provided academic periods/programs, learner profiles, DRAFT/SUBMITTED applications, private PDF uploads, Registrar review and correction history. Readiness work added account linking, MFA, user/configuration/audit screens and in-app PDF preview. It did not yet implement sections, guidance completion, official-enrollment gating, reporting or live blockchain delivery.

## 2. Implemented workflow

School provisions account → learner completes own profile → chooses track/program → submits early enrollment → uploads requirements → system validation → Registrar verifies latest required PDFs → Guidance records completed interview → Registrar qualifies and confirms pre-enrollment → automatic/manual preliminary section → manually recorded LIS readiness/submission/confirmation → officially enrolled. No direct LIS API exists or is claimed.

## 3–4. Files

The principal new modules are `backend/apps/admissions/enrollment_models.py`, `enrollment_services.py`, `enrollment_api.py`, `reports.py`; `accounts/administration.py`, `security.py`, `security_views.py`; `audit/api.py`; `blockchain_records/api.py`, `services.py` and management commands; `blockchain/contracts/EnrollmentIntegrityRegistry.sol`; new React role/configuration/section/report/security/blockchain pages and enrollment/PDF components; `Dockerfile.client`, `compose.client.yml`, `deploy/`, `scripts/` and `docs/CLIENT_TESTING.md`.

Existing models, serializers, services, permissions, routes, role setup, application/profile/review screens, App/AppShell, styles, package/requirements files, CI tests and baseline documentation were extended. Original `backend/`, `frontend/`, `blockchain/` modules and DevelopmentAnchor contract remain. Original migrations were not rewritten.

School-provided assets are in `frontend/public/assets/school-logo.png` and `school-facade.png`.

## 5. Migrations

- accounts0003: MFA/security version, encrypted secrets, recovery hashes and login-attempt windows.
- admissions0003: optional LRN, one owner/profile, education fields, configurable track references, enrollment stages, sections/assignments, interviews, events and LIS records.
- admissions0004: seed Academic/TechPro capacity configuration and migrate existing submitted records to document-verification stage; preserve existing programs and records.

Fresh migration and rollback/reapply are checked in a disposable database. Reversing domain migrations in a populated deployment discards the new domain data and cannot preserve newly configured track codes under old constraints; back up and review such a rollback first. No development database reset occurred.

## 6. APIs

All paths are under `/api/v1/` unless specified:

| Endpoint | Purpose |
|---|---|
| `/tracks/` | Configurable tracks/capacity defaults |
| `/sections/`, `/sections/{id}/roster/` | Section management and scoped rosters |
| `/enrollments/`, `/enrollments/{id}/` | Paginated, filtered workflow records |
| `/enrollments/{id}/transition/` | Interview, evaluation, pre-enrollment, assignment and LIS actions |
| `/enrollment-metrics/` | Scoped dashboard aggregates |
| `/enrollment-reports/?report=…&export=csv\|pdf` | Twelve report datasets/exports |
| `/documents/{id}/preview/` | Authorized private PDF preview |
| `/documents/{id}/integrity/` | Stored/presented PDF hash comparison |
| `/blockchain-records/`, `/{id}/retry/`, `/connection/` | Transaction monitoring and reconciliation |
| `/accounts/security/` | MFA, password and session management |
| `/accounts/users/`, `/directory/`, `/dashboard/`, `/system/`, `/access-policy/` | Custom account/admin workspaces |
| `/learners/{id}/link-applicant/` | Audited link of unowned walk-in record |
| `/audit-events/` | Read-only audit search |

Existing intake/upload/review APIs remain. OpenAPI describes the resulting schema. Workflow transition names include `interview`, `qualify`, `not_qualified`, `reject`, `reopen`, `complete_program`, `pre_enroll`, `auto_assign`, `assign`, `remove_section`, `lis_prepare`, `lis_submit`, `lis_confirm`, `lis_reject`.

## 7–8. Rules and assignment

Registrar-only document/evaluation decisions; completed guidance plus verified mandatory documents; one active learner/year assignment; no over-capacity allocation; matching year/grade/track/program; reason-required manual changes; no official enrollment without manual LIS confirmation. PostgreSQL year/application/learner/section locks serialize allocation. Select lowest assigned count, then section code/ID. Full matching sections produce NO_AVAILABLE_SECTION and keep the learner waiting; no section is auto-created.

## 9. Document workflow

Private parsed PDFs,30MiB limit, metadata/hash, retained versions, in-app preview and download. Reject/correction permits a replacement, verified remains locked. Registrar verifies content suitability; duplicate-byte flags and hash comparison are system checks. Actual confirmed blockchain proof is compared when available, with explicit unavailable/failure results. Neither hash nor blockchain proves original credential authenticity.

## 10. LIS workflow

Manual service abstraction: ready → submitted → confirmed/rejected. Confirmation requires evidence/remarks and optional reference. The confirmation date/actor and official-enrollment event are retained. Section changes are blocked once submitted to LIS. Direct connector, post-LIS correction and withdrawal procedures remain deferred.

## 11. Reports

Early Enrollment Master List; by Track; by Cluster/Strand; by Section; Section Master List; Section Capacity/Utilization; Unassigned Learners; Pending Document Verification; Pre-Enrolled Learners; Learners for LIS Registration; LIS Confirmed Learners; Registration Status Summary. Shared JSON/CSV/PDF datasets, appropriate filters, private responses and audit events. CSV neutralizes formula-prefixed values.

## 12. Tests

Backend permission/uniqueness/PDF-size-MIME/hash/submission/review/resubmission tests retained and updated. Added guidance/LIS transition gates,40/25capacity/full queues, matching/lowest-count allocation, transfer/removal history, concurrent PostgreSQL allocation, custom capacity overrides, single profile, legacy-program completion, report privacy/exports, account permissions and real EVM authorization/idempotence/hash-match/tamper tests.

Frontend unit tests cover auth/refresh/errors/forms/uploads; real Django browser tests cover PDF preview, correction, full interview/section/LIS flow and MFA. Docker smoke checks every available role page, accessibility rules and mobile overflow, saving private screenshots. Automated checks do not replace client acceptance or a full security/accessibility review.

Validation completed on 13 September 2026:

- PostgreSQL suite: 93 passed, one opt-in EVM test skipped; the EVM test passed separately against real local Hardhat. PostgreSQL coverage includes concurrent section allocation.
- SQLite suite: 92 passed, two environment-specific tests skipped. After the final health configuration fix, both health tests passed separately, including the new client-chain configuration regression test.
- Frontend: 12 unit tests and nine browser tests passed; lint and production build passed.
- Rebuilt Docker stack: 47 role/page checks passed, including automated accessibility checks and desktop/mobile screenshots. The web health endpoint reports database availability and the configured local blockchain.
- Ruff, Django system checks, migration consistency and strict OpenAPI validation passed. Fresh migration, rollback and re-application checks passed.
- Both Solidity contracts compiled; development and client Docker Compose configurations validated.

The UI audit consolidated dashboard shortcuts, corrected role-specific metrics and navigation, removed duplicate status displays and excess explanatory copy, and checked mobile layout and keyboard/accessibility semantics. Registrar action fields now retain newly entered remarks when a preceding request finishes.

## 13–14. Assumptions and limitations

See ASSUMPTIONS.md. Actual program offerings and academic scoring thresholds remain unconfirmed. Requirement configuration remains live. MFA is opt-in. Local Hardhat is ephemeral demonstration infrastructure, with audited proof re-anchoring after restart; production signer/network/custody are not configured. No fabricated LIS integration, automatic fraud-authenticity verdict, public document URLs or public PII are provided. This is ready for synthetic client acceptance testing after the validation checklist, not an assertion of production readiness.

## 15–16. Setup and commands

Client startup, exact account locations, port-forwarding configuration and complete manual test steps are in [CLIENT_TESTING.md](CLIENT_TESTING.md).

```sh
# Repository root
python3 scripts/prepare-client-test.py
docker compose --env-file .env.client -f compose.client.yml up --build -d
docker compose --env-file .env.client -f compose.client.yml ps
PLAYWRIGHT_BROWSERS_PATH=/tmp/enrollchain-playwright node scripts/client-smoke.mjs

# backend/
.venv/bin/ruff check .
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py spectacular --file /tmp/enrollchain-schema.yml --validate --fail-on-warn
.venv/bin/pytest -q
# Point DATABASE_URL at a dedicated PostgreSQL TEST database to include concurrency.
# Start local Hardhat before this opt-in real EVM check:
ENROLLCHAIN_TEST_RPC=http://127.0.0.1:8545 .venv/bin/pytest tests/test_evm_integration.py -q

# frontend/
npm run lint
npm run test -- --run
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/enrollchain-playwright npm run test:e2e

# blockchain/
npm run compile -- --force
# Repository root
docker compose config --quiet
docker compose --env-file .env.client -f compose.client.yml config --quiet
```

Checkpoint2f7500a was committed/pushed before these updates as previously authorized. Subsequent changes remain uncommitted. Staff users/passwords are preserved; the retired learner demo and both old login IDs were removed under the latest explicit reset request.

## Client UI review — 13 September 2026

- Login retains one school identifier in the header; shared page headings no longer repeat the school/system tagline.
- Learners have a full-width personal profile with grouped information. Editing replaces the read view. Staff use a searchable, paginated learner directory and open one record at a time; sensitive profile fields are absent from directory rows.
- Learner creation controls and the direct new-application route defer to an existing unfinished application. Staff retain application creation. Existing period uniqueness rules remain unchanged.
- Navigation uses **Blockchain verification**. Hashes/network data are expandable; file comparison uses readable results instead of raw status constants.
- Staff learner lists use server pagination by default, with `search` and `page`. The learner's existing array response remains compatible and contains at most their own profile.
- Section lists and rosters accept `page`; their UI requests 20 records per page. Report previews use database pagination before document-checklist calculation, grouped reports use database aggregation, and CSV/PDF exports retain all filtered records. Configuration lists paginate their smaller in-memory option datasets.
- Removed repeated role explanations, promotional review copy and redundant helper paragraphs. Necessary field constraints and security confirmation instructions remain beside the relevant controls.

No migration or data reset is required for these UI corrections.

UI review validation: 96 backend tests passed (two environment-specific skips), 15 frontend tests passed, 10 browser tests passed, and 47 Docker role/page checks passed. Ruff, Django checks, migration consistency, strict OpenAPI validation, frontend lint and production build passed. The final profile scroll/focus adjustment was additionally checked in the focused browser test.
