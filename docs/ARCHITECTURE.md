# Foundation Architecture

```text
React web app
    |
    | JSON/HTTPS
    v
Django REST API ---- PostgreSQL
    |
    +---- private file storage adapter
    |
    +---- blockchain provider boundary ---- EVM JSON-RPC
```

## Boundaries

- Django is the authoritative system of record for users, workflows, permissions, audit metadata, and blockchain transaction state.
- File bytes are handled through a private storage adapter. A later object-storage change must not alter domain models.
- EVM communication is isolated behind a provider boundary. The application remains operable while blockchain support is disabled or unavailable.
- The frontend uses the versioned `/api/v1` boundary and does not access databases, files, or wallets directly.
- On-chain payloads must contain opaque identifiers and cryptographic hashes, never personal data.

## Milestone 1 domain

`apps.admissions` owns SchoolYear, AdmissionPeriod, Program, Learner, Application, Requirement, RequirementRule and DocumentSubmission. Grade choices are fixed at 11/12, with database checks; program names remain data. Learner links to an optional applicant owner; Application links to Learner and its period, and records its creator separately. The applicant is derived from learner ownership, so staff creation does not impersonate an applicant.

Database constraints enforce unique LRN, application reference, learner/period pairs, document versions, valid grades/tracks/statuses and date ordering. Reversible schema migrations add the domain and extend role choices. Service functions handle default requirements, applicability, submission and document processing. Writes and their audit events are transactional; upload persistence failures clean up newly stored bytes. PostgreSQL application row locks serialize submission, draft changes and version allocation; submission also locks the learner against concurrent profile edits.

## Access and storage

All domain endpoints require JWT authentication. Applicants are scoped to owned learners and applications, including nested checklist, upload relations and downloads. Staff roles also require the corresponding Django permission; submission uses `admissions.submit_application`. Guidance and adviser roles gain no automatic record access. Configuration reads require authentication; writes require model permissions. The `setup_admissions_roles` command creates additive groups for explicit assignment by an administrator.

Uploads are multipart requests to `/api/v1/documents/`. Validation checks the 30 MiB limit, `.pdf` extension, MIME type, signature and parsing with pypdf, rejecting encrypted/empty/unreadable files. SHA-256 is computed over uploaded bytes. Random private filenames prevent name collisions; each replacement creates another version. The API returns metadata, never a media URL. `/api/v1/documents/{id}/download/` rechecks access and streams an attachment with no-store caching and nosniff. Storage `.url()` raises explicitly. Religion/IP values are confined to authenticated learner responses, excluded from application/document serializers and audit metadata. This domain never calls the blockchain provider.

Configuration is editable through audited admin/API operations. Workflow admin screens are inspection-only so direct admin writes cannot bypass submission and upload services. Application/profile deletion and document update/deletion endpoints are not exposed. Required rules combine additively; all mandatory applicable requirements must have at least one upload at submission. Current checklist configuration remains live; configuration snapshots are not implemented.

## Frontend session and API boundaries

React retains the foundation page and adds protected profile/application routes. Session tokens are scoped to sessionStorage; a shared refresh request rotates tokens and retries a protected request once. Logout clears identity and private query caches. The API client handles multipart payloads without setting a JSON Content-Type, structured validation errors, 204 responses and authenticated binary downloads. Navigation/action visibility follows role and permission data from `/accounts/me/`; the API remains authoritative.

## Development limitations

Local checks use synthetic fixtures and SQLite; PostgreSQL constraints and row locks are the production-target implementation, but SQLite tests do not exercise concurrent PostgreSQL locking. No worker, blockchain registration, malware scanning or public storage route is introduced. Milestone 2 adds private registrar document-review decisions. Production reverse-proxy upload limits, scanning, TLS, key custody, storage encryption and retention remain deployment work.


## Milestone 2 review boundary

DocumentReview holds one immutable decision for a DocumentSubmission. A pending state is derived from the absence of a review; no mutable verification state is duplicated on the file. Queue queries use a correlated EXISTS expression to include only the latest file version per application/requirement and filter to submitted applications. Server pagination limits each page to 20 documents.

Review writes require both a REGISTRAR role and `admissions.review_document`, plus document viewing permission at the endpoint. The queue requires REGISTRAR/ADMINISTRATOR and document/review viewing permissions. An administrator superuser does not bypass the registrar-only decision rule. Existing applicant querysets still enforce ownership for private review history.

Review and upload services lock the same application row, so another decision or replacement cannot race past a prior decision check on PostgreSQL. The one-to-one review constraint also prevents duplicate decisions. Reviews and audit events commit together. A replacement keeps the old file/review intact and receives the next version, with no inherited review. Checklist responses include the latest review status and whether a replacement is permitted.

The frontend `/reviews` route provides registrar actions and administrator oversight. A Radix dialog supplies modal semantics, focus containment, Escape dismissal and focus return; the app root becomes inert while the dialog is mounted. Radio choices and remarks use native labeled controls. CVA controls reusable button/status variants. Tailwind supplies a restrained page entrance, layered elevations and reduced-motion overrides. TypeScript 6 validates production and browser-test code. Browser checks use Chromium and axe-core; APIs are mocked for frontend tests while Django tests exercise real service/persistence behavior.
