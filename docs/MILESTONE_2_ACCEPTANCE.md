# Milestone 2 — Document Review and Targeted Resubmission

## Confirmed behavior

- Registrars with explicit review permission decide document reviews. Administrators have oversight; neither administrators nor guidance/adviser roles can decide reviews, even if assigned the review permission.
- The queue includes the latest version of each document on a submitted application. It supports status filtering, learner/reference/requirement search and server pagination.
- Decisions are VERIFIED, REJECTED and RESUBMISSION_REQUESTED. Rejection/correction requires explanatory remarks. Reviews are immutable and audit-recorded; superseded or already-reviewed versions cannot receive another decision.
- Only a document flagged for resubmission may be replaced after application submission. The replacement starts awaiting review. Earlier files and reviews remain available; application and learner editing stay locked.
- No admission decision, eligibility outcome, official enrollment or blockchain proof is implied by document verification.

## Changed areas

- Backend: DocumentReview model and reversible `0002_documentreview` migration; review/queue serializers and routes; permission checks; transactional review and replacement services; checklist/history metadata; read-only admin registration and updated role setup.
- Frontend: `/reviews` workspace, review dialog, outcome badges, correction uploads/history, reusable CVA/Radix primitives, accessible field associations, loading skeletons, refined typography/elevations and reduced-motion handling.
- Tooling: TypeScript 6, shadcn configuration/aliases, formatting tools, Chromium/axe browser checks and CI integration. Existing application screens remain functional.

## Validation and limits

Validation commands and results are recorded after the final checks below. Django tests use SQLite, while browser tests exercise the actual React UI with mocked API responses. These do not replace PostgreSQL concurrency testing, school user acceptance or a full production accessibility audit. Automated accessibility checks cover the review queue and active review dialog at tested desktop/mobile sizes.

Local migration and role setup were applied without changing test-account passwords. No commit or push was performed. Review reversals, applicant-profile correction, admission/registration workflows, LIS, notifications, QR and blockchain integration remain outside this phase; see ROADMAP.md.

### Final check results

| Check | Result |
|---|---|
| Backend Ruff | Passed |
| Django system check | Passed |
| Migration consistency | Passed; no missing migrations |
| Backend suite | 64 passed (49 existing + 15 review tests) |
| Strict OpenAPI validation | Passed with `--validate --fail-on-warn` |
| Migration apply/reverse/reapply | Passed on a disposable SQLite database |
| Frontend lint | Passed |
| TypeScript 6 / production build | Passed |
| Frontend unit tests | 12 passed |
| Chromium browser tests | 5 passed |
| axe-core WCAG 2 A/AA and 2.1 AA checks | No violations in tested queue/dialog/mobile states |
| Compose configuration | Passed |
| Git whitespace check | Passed |

Browser coverage includes modal keyboard navigation, inert background, Escape/focus restoration, post-review focus placement, required correction remarks, retained feedback on stale-review errors, administrator read-only oversight, mobile overflow and applicant replacement uploads. The queue pauses polling while a review dialog is open. Browser tests do not replace a complete manual accessibility audit; backend row-lock behavior still requires PostgreSQL concurrency testing before production use.

Use the existing `registrar@enrollchain.test` account at `/reviews`; its review and queue permissions have been verified locally. The administrator uses the same route for oversight. Existing passwords have not been changed.
