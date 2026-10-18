# EnrollChain — early enrollment client testing

The current release adds preliminary section assignment, guidance/Registrar processing, private document integrity, reporting and manual LIS reconciliation. **DepEd LIS remains the official enrollment record.**

Start the isolated client stack and find generated login accounts in [Client testing](docs/CLIENT_TESTING.md). Current scope: [Scope baseline](docs/SCOPE_BASELINE.md).

```sh
python3 scripts/prepare-client-test.py
docker compose --env-file .env.client -f compose.client.yml up --build -d
```

Open http://localhost:8080. Forward only this web port; add the forwarded hostname to `.env.client` as documented. Existing local users and records are preserved.

The instructions below describe the original developer setup. Earlier milestone-only limitations are superseded by the current scope baseline.

# EnrollChain

EnrollChain is a blockchain-assisted student admission and registration prototype for Sto. Domingo National Trade School.

This repository implements the first two development milestones for **Sto. Domingo National Trade School Senior High School, Grades 11 and 12**: academic configuration, learner profiles, draft/submitted applications, private PDF submission, registrar document review and targeted resubmission. Unconfirmed workflows remain deferred; see [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) and [`docs/SCOPE_BASELINE.md`](docs/SCOPE_BASELINE.md).

## Structure

```text
backend/      Django REST API
frontend/     React and TypeScript web application
blockchain/   Hardhat development environment
docs/         Scope, assumptions, architecture, and acceptance notes
```

## Local development with Docker

1. Copy `.env.example` to `.env` and replace the development secrets.
2. Run `docker compose up --build`.
3. Open the frontend at `http://localhost:5173`.
4. Open API documentation at `http://localhost:8000/api/docs/`.

The local services are PostgreSQL, Django, Vite, and a Hardhat JSON-RPC node. Blockchain integration is disabled by default until the client confirms network and wallet-custody requirements.

## Local development without Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Blockchain tooling:

```bash
cd blockchain
npm install
npm test
```

## Quality checks

```bash
make check
```

No real student records or production blockchain keys should be used in the development environment.

## Milestone 1 setup

After installing backend dependencies (including the pinned PDF parser):

```bash
cd backend
python manage.py migrate
python manage.py setup_admissions_roles
python manage.py createsuperuser
```

For Docker, use `docker compose exec backend python manage.py <command>` for those commands.

1. Sign in through the frontend (`http://localhost:5173/login` locally, or `http://localhost:8080/login` with the client Docker stack).
2. Administrator: use School Configuration to create the school year, admission period, tracks, programs and requirement assignments. NEW and TRANSFEREE initially require the four confirmed documents; RETURNING initially requires none.
3. Configure the school’s actual programs and sections. Client-test programs prefixed DEMO are synthetic fixtures only.
4. Use Users & Access to provision learner/staff accounts. Permissions are assigned through the role foundation; Guidance records interviews and Class Advisers view their assigned section rosters. Technical Django admin is not routed.
5. Learner: complete your profile, choose period/grade/track/program, save and submit early enrollment, then upload required PDFs. Registrar can create walk-in records and link an unowned profile to a learner account.

Submission is receipt only. Verified documents and a completed guidance interview gate qualification. Preliminary sectioning follows pre-enrollment; manually recorded LIS confirmation is required for official enrollment. Rejected/correction-requested document versions may be replaced with history retained. See [Client Testing](docs/CLIENT_TESTING.md) for the complete workflow and private account-file location.

## Milestone 1 API

All endpoints below are under `/api/v1/` and require authentication:

| Resource | Operations |
|---|---|
| `school-years/`, `admission-periods/`, `programs/` | Read; permission-controlled configuration CRUD |
| `requirements/`, `requirement-rules/` | Requirement catalog and assignment CRUD |
| `learners/` | Owned/authorized list, create, retrieve, update |
| `applications/` | Owned/authorized list, draft create/retrieve/update |
| `applications/{id}/requirements/` | Applicable checklist |
| `applications/{id}/submit/` | POST to submit a complete draft during an open period |
| `documents/` | Multipart POST (`application`, `requirement`, `file`); list/history, optional `?application={id}` |
| `documents/{id}/download/` | Authorized binary PDF download |

JWT login, refresh, logout and current-user routes remain available. Detailed schemas and permission behavior are documented at `/api/docs/`. PDF uploads accept at most 31,457,280 bytes. Private media must not be served directly by a web server.

See [Milestone 1 acceptance and validation](docs/MILESTONE_1_ACCEPTANCE.md) for checks and limits.


## Milestone 2 — document review

After updating dependencies, run `python manage.py migrate` and `python manage.py setup_admissions_roles` in the backend virtual environment. Both commands have been applied to the local SQLite development instance. Existing test-account passwords are unchanged. Sign out and back in to refresh the frontend permission list.

1. Submit an learner application with its required PDFs.
2. Sign in as the registrar, open **Document review**, and download a submitted PDF for inspection.
3. Choose **Verify document**, **Request a correction**, or **Reject document**. Rejection/correction requires remarks.
4. For a correction request, sign in as that learner, open the application, read the feedback, and upload a replacement for the flagged requirement. Application fields stay locked.
5. Return to the registrar queue: the new version awaits review. The earlier version and decision remain in application history.
6. Administrators can inspect the same queue and histories, but cannot record review decisions. Guidance/adviser accounts have no queue access.

Additional API endpoints: `GET /api/v1/documents/review-queue/?status=PENDING&search=&page=1` and `POST /api/v1/documents/{id}/review/` with `decision` and `remarks`. See `/api/docs/` for schemas. Reviews are final for that version; administrative reversal is not implemented.

The frontend uses React 19, TypeScript 6, Tailwind v4 and local Radix/shadcn-style primitives with CVA variants. Run browser checks from `frontend/`:

```bash
npx playwright install chromium
npm run test:e2e
```

In this local development session Chromium was installed under `/tmp/enrollchain-playwright`; use `PLAYWRIGHT_BROWSERS_PATH=/tmp/enrollchain-playwright npm run test:e2e` to reuse it. Unit checks remain `npm run test -- --run`. No real student data is required.

See [Milestone 2 validation](docs/MILESTONE_2_ACCEPTANCE.md) and the [development roadmap](docs/ROADMAP.md).

## Readiness update: administration, security and PDF preview

See [readiness testing and accounts](docs/READINESS_ACCEPTANCE.md) for startup, account entry points and the end-to-end checklist. The update adds role-specific workspaces, school configuration, delegated user management, a read-only audit viewer, authorized unowned-profile linking and in-app PDF preview with page/zoom controls. Downloads remain available.

`/security` provides opt-in authenticator MFA, one-use recovery codes, password change and session revocation. Technical Django admin login checks enrolled MFA too. A stable dedicated `MFA_ENCRYPTION_KEY` is required outside DEBUG; `.env.example` documents the variable. Login limits use shared database windows. This is an improved development implementation, not a claim that production security or the blockchain research scope is complete.

After dependency installation, apply migrations and run `setup_admissions_roles`, then sign out and back in. The learner role is now LEARNER. The retired demo identities and their records were explicitly reset; staff credentials remain unchanged. See docs/CLIENT_TESTING.md for current accounts.

Browser tests now include a disposable real Django/SQLite server. Install backend requirements into `backend/.venv` (or set `E2E_PYTHON` to that environment's Python), install Chromium with `npx playwright install chromium`, then run `npm run test:e2e` from `frontend/`. Tests create isolated databases and private PDFs; they do not reset local user data.
