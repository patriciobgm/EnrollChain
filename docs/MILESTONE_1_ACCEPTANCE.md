# Milestone 1 Acceptance

## Implementation map

| Area | Main files |
|---|---|
| Academic configuration, profiles, applications, requirements, PDF metadata | `backend/apps/admissions/models.py`, `migrations/0001_initial.py` |
| Validation, ownership, permissions, audited submission/upload services | `backend/apps/admissions/serializers.py`, `permissions.py`, `services.py`, `views.py`, `urls.py` |
| Configuration administration and explicit role groups | `backend/apps/admissions/admin.py`, `management/commands/setup_admissions_roles.py` |
| New roles and logout token validation | `backend/apps/accounts/models.py`, `views.py`, `migrations/0002_alter_user_role.py` |
| Private URLs, API registration, binary OpenAPI requests, PDF dependency | `backend/apps/common/storage.py`, `backend/config/settings.py`, `urls.py`, `backend/requirements.txt` |
| Authenticated frontend and session refresh | `frontend/src/lib/api.ts`, `lib/auth.tsx`, `app/App.tsx`, `components/AppShell.tsx`, `pages/LoginPage.tsx` |
| Learner/draft/list/checklist/upload/download/history screens | `frontend/src/pages/LearnersPage.tsx`, `ApplicationFormPage.tsx`, `ApplicationsPage.tsx`, `ApplicationDetailPage.tsx`, `lib/admissions.ts`, `components/Form.tsx`, `styles.css` |
| Regression and workflow tests | `backend/tests/test_admissions.py`, `test_accounts.py`, `frontend/src/app/Milestone.test.tsx` |
| Repeatable checks and scope/setup notes | `.github/workflows/ci.yml`, `Makefile`, `README.md`, `docs/ASSUMPTIONS.md`, `SCOPE_BASELINE.md`, `ARCHITECTURE.md` |

The foundation page, health endpoint, account API and development Solidity contract remain available. No contracts or blockchain integration were added.

## Validation

Commands run using the existing backend virtual environment and frontend/blockchain dependencies:

| Check | Command | Result |
|---|---|---|
| Backend Ruff | `.venv/bin/ruff check .` | Pass |
| Django system check | `.venv/bin/python manage.py check` | Pass |
| Migration consistency | `.venv/bin/python manage.py makemigrations --check --dry-run` | Pass; no changes detected |
| Backend tests | `.venv/bin/pytest -q` | 49 passed |
| OpenAPI validation | `.venv/bin/python manage.py spectacular --file /tmp/enrollchain-schema.yaml --validate --fail-on-warn` | Pass, including binary multipart upload schema |
| Frontend lint | `npm run lint` | Pass |
| Frontend tests | `npm run test -- --run` | 12 passed |
| Frontend production build | `npm run build` | Pass |
| Solidity compilation | `npm run compile -- --force` | Pass; 1 Solidity file, solc 0.8.28 |
| Compose configuration | `docker compose config --quiet` | Pass |
| Migration reversal | Apply all → reverse admissions to zero → reverse accounts to 0001 → apply all | Pass on a disposable SQLite database |
| Permission setup | `setup_admissions_roles` on disposable database and idempotence tests | Pass |

Hardhat required access to its compiler cache outside the workspace; compilation succeeded with that access. No changes were committed or pushed. The existing application database was not migrated as part of these checks; use the README setup commands to initialize/update a development instance.

## Coverage and practical limits

Backend tests cover role permissions, cross-account isolation, walk-in creation/editing, unique LRN/application constraints, configurable program/requirement matching, future birthdates and derived age, invalid/oversized/encrypted PDFs, the exact 30 MiB boundary, byte-exact SHA-256, retained versions, authorized downloads, storage rollback on audit failure, upload immutability, submission prerequisites/locking, JWT refresh rotation/logout ownership, and OpenAPI binary uploads.

Frontend tests cover protected routes, login errors/success, token refresh/expiry, role navigation, profile validation messages, configurable program filtering and draft payloads, invalid/oversized PDF selection, multipart upload and submission, empty/error states, and cache/session clearing on logout. Existing foundation rendering remains tested.

Local backend tests use SQLite and frontend interaction tests use jsdom with mocked API responses. PostgreSQL concurrency, a real-browser end-to-end run, production deployment, and real student records were not exercised. Submission/version services use database constraints and PostgreSQL row locks; nullable program joins are excluded from locking via `of=("self",)` where needed.

## Assumptions and deferred decisions

[ASSUMPTIONS.md](ASSUMPTIONS.md) distinguishes confirmed requirements from engineering assumptions: 12-digit unique LRN; optional sensitive/family fields; school-provisioned accounts and optional walk-in account ownership; mandatory uploads during an open period before submission; edits locked after submission; 30 MiB readable unencrypted PDFs; live requirement configuration; no default guidance/adviser permissions; LATE recognized but blocked.

Eligibility, admission decisions, interviews, section assignment, LIS, verification responsibilities, legacy import, late authorization, notifications, QR, production blockchain, and reporting beyond development lists remain explicitly deferred in [SCOPE_BASELINE.md](SCOPE_BASELINE.md).
