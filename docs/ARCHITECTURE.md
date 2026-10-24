# Architecture

React19 / TypeScript6 / Tailwind4 → versioned Django/DRF API → PostgreSQL and private file storage. Existing Radix/CVA UI primitives, JWT and Django permissions are retained. Blockchain communication stays in apps.blockchain_records; admissions invokes integrity services without importing Web3. DepEd LIS is represented by a manual domain service, not network calls.

## Reused and extended domain

SchoolYear, AdmissionPeriod, Program, Learner, Application, Requirement, RequirementRule, DocumentSubmission, DocumentReview, AuditEvent and BlockchainTransaction are retained. TrackConfiguration uses existing stable track codes to avoid rewriting old records. Program/Application/RequirementRule codes are validated against that configuration; Sections use a foreign key.

Application.status remains DRAFT/SUBMITTED. Application.enrollment_status records the school workflow independently. New models: Section, SectionAssignment, GuidanceInterview, EnrollmentEvent and LisRecord. Learner adds previous-education fields, optional LRN and a unique non-null owner. Sensitive profile fields are absent from application/report/blockchain payloads.

Enrollment services enforce role plus Django permission, eligible profile/configuration, verified latest mandatory documents and completed guidance interview. Qualification snapshots document requirements for evidence. Records continue to use live configured requirement checks. Workflow events and audits commit with domain changes. Private guidance remarks are not serialized to learners/advisers.

## Locking and assignment

All section assignment/transfer/removal and capacity writes lock the shared SchoolYear row first. Assignment then locks Application and Learner, followed by matching sections in stable ID order. Counts are derived under that lock; choose available sections by count, code, ID. PostgreSQL nullable program joins are excluded from lock targets explicitly. One-to-one application assignment plus learner/year uniqueness provides a second duplicate guard. No available slot leaves PRE_ENROLLED with a NO_AVAILABLE_SECTION event.

LIS transitions lock the application. Section changes are blocked once submitted to LIS or confirmed. Manual confirmation requires recorded evidence and produces both LIS_CONFIRMED and OFFICIALLY_ENROLLED events. No network connector or automatic LIS confirmation exists.

## Documents and integrity

Private files are parsed PDFs up to30MiB; random stored names, original metadata, SHA-256, upload date and immutable version/review history are retained. Authorized JWT endpoints stream download/preview without public storage URLs. PDF.js renders locally with a bundled worker. Rejected/correction-requested versions can be replaced; verified/qualified records remain locked. Verification recomputes the stored file hash before accepting the Registrar decision.

Upload flags identify duplicate bytes without exposing another learner's identity. Integrity checks hash stored/presented bytes and compare against actual confirmed blockchain evidence when available, otherwise the database upload hash with an explicit source label. Unavailable blockchain evidence returns unavailable rather than a success claim.

EnrollmentIntegrityRegistry supplements the existing DevelopmentAnchor contract. Only the deployer/issuer can register opaque references, hashes and event-type hashes; conflicting duplicates revert and exact duplicates are idempotent. BlockchainTransaction tracks queued/submitted/confirmed/failed delivery. Transaction identity is persisted before receipt waiting; failures remain retryable. Private PDFs and PII never leave the backend for chain storage. Local unlocked signing is restricted to development/client-test mode and chain31337; production signer custody is not configured.

## Access and security

Learner querysets are owner-scoped. Registrar alone reviews documents and qualifies/confirms pre-enrollment. Administrator manages configuration/users/sections/reports/audits. Guidance records interview completion. Adviser reads only their assigned rosters. Server authorization remains authoritative.

School account provisioning requires administrator permissions and password/factor confirmation. Superadministrator may grant individual permissions through a custom audited page; role boundaries remain enforced. Permission/account/security changes revoke sessions. Django /admin/ is not exposed.

TOTP secrets are Fernet encrypted, recovery codes hashed/single-use, enrollment expires, OTP replay is blocked, and database-backed attempt windows limit authentication. Access/refresh tokens check security version and password fingerprints. SessionStorage remains the development browser session adapter; production cookie/session policy is an open deployment decision.

## Reporting and deployment

One report dataset implementation powers JSON, CSV and ReportLab PDF. Roster fields exclude religion/IP/family details. CSV values are protected against spreadsheet formula interpretation. Report reads/exports are authorized and audited.

compose.client.yml uses isolated PostgreSQL/private-file/runtime volumes, a bundled Nginx frontend, Gunicorn backend, internal Hardhat and an integrity worker. Only localhost:8080 is published. The frontend uses /api/v1 on its current origin for port forwarding. Initial accounts and DEMO configuration are idempotent, with private generated credentials outside Git. The worker reconciles/re-anchors proofs when the ephemeral local Hardhat node restarts, retaining the old transaction identity in audit history. This is a synthetic acceptance environment, not a production blockchain deployment.

Tests cover APIs/security/domain rules, PostgreSQL concurrency, actual EVM transactions, React behavior, real Django browser workflows and Docker role-page/accessibility checks. See CLIENT_TESTING.md for execution and environment limits.

### Client UI Maintenance

`accounts.0004` adds recipient-scoped notifications; `accounts.0005` converts APPLICANT roles/groups to LEARNER and increments session security versions. The older account-link endpoint and historical database constraint names remain compatible. Notification delivery participates in domain transactions, so all migrations must be applied before running interview/document actions.

The document queue paginates application groups and loads their document rows on demand. Shared sortable headers expose `aria-sort`; sort icons appear on hover or keyboard focus. Staff learner details and section forms reuse the Radix dialog primitive.

Registrar reuses `/accounts/users/` for permitted list/retrieve/create operations, scoped to non-superuser LEARNER and CLASS_ADVISER accounts. Backend role checks reject other target roles and all Registrar account updates. `setup_admissions_roles` grants view/add account permissions. The classification-label migration retains stored RETURNING values; `classification` joins the existing grade filter in enrollment/roster/report queries.

### Panel Readiness Additions

`GET /documents/{id}/verification-qr/?origin=...` reuses document permissions/ownership and returns a private, no-store SVG generated by the existing ReportLab QR encoder. It permits only the request host or explicitly configured CORS origin. The QR links to `/verify-documents/{id}`; sign-in preserves only a whitelisted UUID verification route. No bearer token, learner metadata or storage URL is embedded. Nginx preserves the incoming Host port for origin validation.

Migration `admissions.0006` adds a read-only reminder timestamp. `send_requirement_reminders` locks each candidate application, rechecks due time and requirement upload eligibility, and atomically creates a notification, updates its timestamp and audits the send. The Docker worker checks every ten minutes; no external scheduler or email service is introduced.

The existing report endpoint now accepts `report=blockchain-transactions`. It filters proof operation keys through the same scoped application cohort and checks blockchain-view permission. JSON pagination/sorting and CSV/PDF exports use the existing engine. GitHub's blockchain job now runs the real-EVM integration test in addition to compilation.
