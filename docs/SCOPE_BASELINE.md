# Scope Baseline — Milestones 1 and 2

## Institution and authority

Sto. Domingo National Trade School Senior High School only, Grades 11 and 12. This baseline records the user's explicit milestone confirmation, superseding the initial foundation-only deferral of profiles, applications and configurable requirements. Client documents supply requirements; broader MVP features in them remain outside this milestone.

## Delivered scope

- Preserve backend/, frontend/ and blockchain/ foundation, health endpoints, JWT, Django permissions, private-storage adapter and audit infrastructure.
- School years, admission periods and configurable programs; only ACADEMIC and TECHNICAL_PROFESSIONAL tracks. No hard-coded strands.
- Five roles: APPLICANT, REGISTRAR, ADMINISTRATOR, GUIDANCE_OFFICER and CLASS_ADVISER; explicit model/action permissions for staff.
- Private learner profiles with all confirmed fields and calculated age.
- Applicant-owned and registrar walk-in applications, unique references, database uniqueness per learner/period, DRAFT → SUBMITTED, timestamps and audit events.
- Configurable requirement catalog/rules scoped by period, classification, grade, track and program, with confirmed initial NEW/TRANSFEREE defaults. No default documents for RETURNING.
- Private PDF submissions up to 30 MB, content validation, SHA-256, metadata, version history, authorized downloads and upload audit events. No document blockchain registration.
- DRF API, serializers, permissions, viewsets, OpenAPI, reversible schema migrations, audited services, configuration admin and read-only workflow admin inspection.
- Responsive React login/session handling, role-aware navigation, learner forms, draft creation/editing, period/program choices, checklist, PDF upload/download/history and application list/status. Loading, validation, empty and error states.
- Backend and frontend tests, strict schema validation, lint/build checks, local Solidity compilation and Compose configuration validation.

Academic configuration is managed through Django admin or the authenticated configuration API. No separate React configuration editor is claimed. School-provisioned accounts use the existing account administration; public signup/reset is outside this milestone.

## Confirmed Milestone 2 — document review and correction

On 2026-09-12 the user authorized continued development and confirmed:

- Only registrars make document verification, rejection and resubmission decisions. Administrators have oversight access; Guidance Officer and Class Adviser receive no review powers.
- Applicants may replace only documents explicitly flagged for resubmission while their submitted application stays locked.

Delivered scope: a paginated searchable queue of the latest document versions from submitted applications; VERIFIED, REJECTED and RESUBMISSION_REQUESTED decisions; required explanatory remarks for rejection/correction; an immutable review per version; retained previous versions and audit events; targeted replacement uploads returning to awaiting review; private applicant feedback/history; administrator oversight views; explicit Django review permissions; reversible migration; and frontend review screens with React 19, TypeScript 6, Tailwind v4, Radix/shadcn-style primitives and CVA variants.

This replaces Milestone 1's blanket prohibition on uploads after submission only for flagged correction requests. It does not change application or learner editing rules, or introduce admission/registration decisions. Document VERIFIED is a registrar decision, not blockchain registration or proof of authenticity.

## Still deferred

- Eligibility rules and automatic qualification
- Final admission decisions, interviews, approval sequence and registration/enrollment status beyond submitted application receipt
- Automatic section assignment and capacity algorithms
- LIS integration and manual confirmation behavior
- Class Adviser verification responsibilities beyond the confirmed registrar-only document review
- Legacy-record import
- Late-registration authorization (recognized source value, creation/submission blocked)
- Email and other notification delivery
- QR/public credential verification
- Production blockchain contract, network, wallet and recovery configuration
- Reports beyond basic development views
- Production hosting, real student data, retention and consent arrangements
- Grade management, payments, schedules and other student-information-system functionality

Implementation assumptions and unresolved questions are listed separately in [ASSUMPTIONS.md](ASSUMPTIONS.md). No admission result, official enrollment, credential verification or blockchain registration is implied by SUBMITTED.
