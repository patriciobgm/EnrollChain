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

1. Sign into `http://localhost:8000/admin/` with the administrator account.
2. Create a school year and admission period. Period creation through admin/API adds the four confirmed requirements for each of NEW and TRANSFEREE; edit requirement rules as needed. RETURNING starts with none.
3. Add only client-provided programs, assigning Academic or Technical Professional. Programs are optional; no invented strands are seeded.
4. Create synthetic applicant/staff accounts. Set the role and, for staff, explicitly assign the matching permission group. Registrar defaults include learner/application/upload management and submission, without configuration management. Guidance/adviser defaults are empty. `is_staff` controls admin-site entry, not API staff authorization.
5. Open `http://localhost:5173/login`. Applicants create a learner profile, save a draft, upload required PDFs and submit. Registrars can create a profile without an applicant account and select Walk-in. Linking that profile to a later account is deferred.

Submitted means receipt only, not admission or official enrollment. Application choices lock on submission; documents can be replaced only when a registrar requests a correction; see [implementation assumptions](docs/ASSUMPTIONS.md) for temporary rules. Configuration uses Django admin/API. Existing workflows and uploaded documents are read-only in admin.

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

1. Submit an applicant application with its required PDFs.
2. Sign in as the registrar, open **Document review**, and download a submitted PDF for inspection.
3. Choose **Verify document**, **Request a correction**, or **Reject document**. Rejection/correction requires remarks.
4. For a correction request, sign in as that applicant, open the application, read the feedback, and upload a replacement for the flagged requirement. Application fields stay locked.
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
