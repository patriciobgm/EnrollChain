# Readiness update acceptance — 2026-09-12

> Historical assessment: demo preservation and old accounts below were superseded by the latest explicit reset. Use [Client Testing](CLIENT_TESTING.md) for the current workflow and credentials.
This update addresses ownership, role experiences, administration, audit visibility, authentication and in-app PDF review. It does not complete the broader admission/registration/blockchain research scope.

## Git and local data

The user explicitly requested committing and pushing the previous milestones before further updates. Checkpoint `2f7500a` was pushed to `origin/main`. Subsequent readiness changes are separate working-tree updates unless a later commit is explicitly reported.

the retired demo learner is linked to `retired-primary-login`. Her existing submitted application, document versions and review records were preserved. All six existing users and passwords were compared before/after and retained. A LINK_APPLICANT audit event records the repair. No synthetic database or private PDFs are committed.

## Local startup

Run backend commands from `backend/`:

```sh
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_admissions_roles
.venv/bin/python manage.py runserver
```

Run frontend commands from `frontend/` in another terminal:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/login`. Sign out and back in after this update; tokens issued before the password-revocation upgrade are intentionally rejected. Use the previously supplied local passwords; this update does not change them.

## Accounts and entry points

| Existing local account | Entry / purpose |
|---|---|
| `retired-primary-login` | `/dashboard`; `/learners` now includes the retired demo learner; existing application remains submitted. |
| `retired-secondary-login` | Isolation test: cannot see the retired demo learner or access her application/documents directly. |
| `registrar@enrollchain.test` | `/dashboard`, `/reviews`; PDF review and correction decisions. |
| `admin@enrollchain.test` | Existing technical superuser; `/superadmin`, `/administration`, `/administration/users`, `/administration/configuration`, `/administration/audit`. |
| `guidance@enrollchain.test` | Guidance landing and account security; operational duties still require confirmed workflow. |
| `adviser@enrollchain.test` | Adviser landing and account security; no registrar review decisions. |

The existing admin is a technical superuser. To test **ordinary** administrator restrictions, use its user-management screen to create a separate ADMINISTRATOR test account; do not change/delete the existing admin. The real-stack browser tests already use separate ordinary administrator and technical identities.

## Manual end-to-end acceptance

1. Applicant: sign in, open learner profiles and verify the retired demo learner is visible. Open her existing application; confirm it remains SUBMITTED and retained files/reviews are present.
2. Registrar: open Document review. For a pending file, select Review document, then Preview PDF. Verify pages, zoom, extracted text where available, and retained Download PDF. Existing reviewed versions can be previewed through the queue or application history without a new decision.
3. Registrar: request a correction with meaningful remarks on a pending version. Only a correction request enables replacement; rejection alone does not. If all the retired demo learner’s files already have decisions, use another synthetic application for this scenario rather than overwrite her review history.
4. Applicant: reopen the application. Only the flagged requirement permits a replacement upload. Upload a valid PDF, verify a new pending version and retained prior version/review, and confirm the application stays SUBMITTED.
5. Administrator: open Audit logs, filter PREVIEW_DOCUMENT, REVIEW_DOCUMENT, RESUBMIT_DOCUMENT or LINK_APPLICANT, and inspect actor/time/reference. There are no audit edit/delete controls.
6. Administrator: configure a synthetic school year/period; verify default NEW/TRANSFEREE requirements and no invented programs. Add a school-provided program if appropriate. Edit a test requirement assignment and confirm applicant checklist behavior. Current rules are live, not historical snapshots.
7. Technical admin: create an ordinary administrator or other school account through User accounts, confirming with your own password and factor if enrolled. Ordinary administrators cannot create/promote administrators, edit superuser flags/groups, or enter `/superadmin` and Django technical administration.
8. Security: choose Set up two-factor authentication, enter your current password, add the shown time-based key to an authenticator app and confirm a six-digit code. Save the eight one-use recovery codes before returning to login. Existing sessions are revoked. A code already consumed at enrollment cannot immediately be reused; wait for the next code or use a recovery code.
9. Sign in without a factor on the enrolled account: access is denied. Sign in with a valid new code or one recovery code: access succeeds. Reusing a consumed recovery code fails. Enrolled technical accounts must also provide a factor in Django admin login.
10. Security: test password change or Sign out all sessions on a disposable test account. Old access/refresh tokens stop working. Enabling/disabling MFA is opt-in; none of the existing demo users were enrolled automatically.
11. Second applicant: paste the retired demo learner’s application link and attempt her PDF preview/download endpoints. Access is denied without disclosing her file bytes. Guidance/adviser accounts cannot make registrar decisions.

## Validation

- Backend Ruff, Django system check, migration consistency and strict OpenAPI schema validation.
- Backend regression/security tests, including ownership, preview authorization, MFA replay/recovery, failed-login limits, Django admin MFA, account restrictions and token revocation.
- Frontend lint, unit tests and production build.
- Chromium: five existing UI/accessibility cases plus three real Django integration scenarios, including actual two-page PDF rendering.
- Isolated SQLite migration apply/reverse/reapply.
- Forced Solidity smoke-contract compilation and Docker Compose configuration validation.

Final execution counts are recorded in the delivery response. These tests are not PostgreSQL race tests, a complete accessibility audit, penetration testing, school UAT, or evidence of an integrated blockchain workflow.

## Security configuration and remaining limits

Set a stable, private `MFA_ENCRYPTION_KEY` before non-DEBUG use. Generate a Fernet key with `cryptography.fernet.Fernet.generate_key()` in a trusted local environment and supply it through deployment secret configuration. Do not commit it. Existing enrolled secrets require migration if changing the key; keeping the database without its key is not a recoverable backup.

MFA remains opt-in. Mandatory privileged enrollment, supervised recovery after loss of all factors, public signup/password-reset delivery, production cookie policy, proxy client-IP handling, rate-window cleanup, PostgreSQL concurrency, protected audit retention, malware scanning and storage/backup operations remain explicit follow-up work.

Next business milestone: Registrar final admission approval is confirmed; eligibility, interview prerequisites, rejection/reversal sequence, registration/LIS semantics and section duties still require decisions. Actual blockchain contract/service integration, QR verification, notifications, reports and research measurements remain subsequent delivery work.
