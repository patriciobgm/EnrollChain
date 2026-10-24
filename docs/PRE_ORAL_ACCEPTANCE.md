# Pre-Oral Defense and End-to-End Acceptance — October 24, 2026

EnrollChain manages early enrollment, document review, preliminary sectioning and school reporting. DepEd LIS remains the official enrollment record. Use synthetic data for demonstrations.

## Panel checklist: what exists and what changed

| Panel item | Current implementation / evidence | Work in this update | Defense boundary |
|---|---|---|---|
| Requirements Management | Configurable rules by period, classification, grade, track/program; private PDF upload, versions, checklist, Registrar review | Retained; actionable requirements reminders added | New/Transferee defaults are school assumptions; Balik-Aral has no default requirements unless configured |
| Blockchain Module | SHA-256, local EVM transactions, block timestamps, issuer, transaction hash, confirmation tracking and comparison | Added transaction report; verified against a real isolated EVM | Local Hardhat is one demonstration node; restarts reset chain history. Re-anchoring does not preserve the original chain |
| Smart Contract Module | Issuer-only registration, nonzero reference/hash, idempotent identical proof, rejection of conflicting proof | Expanded real-EVM assertions for empty proofs, timestamp and issuer; added real-EVM CI step | Contract enforces proof rules. Django enforces school workflow rules; the contract does not determine admission or credential genuineness |
| Document Verification | Registrar-only authentication decision; stored/presented PDF hash comparison | Added QR and dedicated authorized verification page, including sign-in return | QR contains a document UUID link only. It does not grant access. A hash match establishes unchanged bytes, not original authenticity |
| Notification Module | Private in-app status alerts, unread count, read-all, delete | Added daily missing/correction requirements reminders, audited and serialized per application | In-app only; no email/SMS/push claim. Worker checks every ten minutes; eligible reminders are at least 24 hours apart |
| Dashboard | Role-specific Learner, Registrar, Administrator, Guidance and Adviser workspaces | Retained; browser role/accessibility checks | Applicant/student are represented by one LEARNER identity and enrollment stage, not duplicate accounts |
| Security & Audit | JWT ownership/permissions, private documents, TOTP, encrypted TOTP secrets, hashed passwords/recovery codes, audit viewer | QR ownership checks and origin restriction; reminder/QR/export audit evidence | MFA is opt-in. Uploaded PDFs and the full database are not application-level encrypted. HTTPS depends on deployment; audit DB is not a blockchain ledger |
| Reports & Analytics | Twelve enrollment/section/LIS datasets and dashboard metrics; CSV/PDF | Added thirteenth dataset: Blockchain Transaction Report, using the same report engine, filters and pagination | Transaction report describes blockchain delivery; financial transactions are outside scope |
| Secure End-to-End Workflow | Profile → submission → documents → Guidance interview → Registrar qualification → pre-enrollment → section → manual LIS processing | Retained and regression-tested | Pre-enrolled/section assigned never means officially enrolled; confirmation is recorded manually with evidence |

## Access and accounts

Local Docker address: **http://localhost:8080** (or http://127.0.0.1:8080).

For remote client testing, forward **port 8080 only**. Use the same forwarded HTTPS URL throughout the demonstration; a QR generated on localhost points to localhost and will not open the Mac from a phone. Create QR codes while browsing the forwarded URL. The exact public hostname must be allowed by `DJANGO_ALLOWED_HOSTS`; if a tunnel rewrites Host, configure the exact portal origin in `CORS_ALLOWED_ORIGINS`. Do not expose PostgreSQL, Hardhat RPC or the backend directly. Keep the Mac awake and Docker/tunnel running.

| Account | Use |
|---|---|
| superadmin@enrollchain.test | System access/permission oversight; use only for administrative configuration tests |
| admin@enrollchain.test | Configuration, sections, accounts, reports, audit and blockchain monitoring |
| registrar@enrollchain.test | Learner/teacher account creation, document review, qualification, pre-enrollment, sections and LIS processing |
| guidance@enrollchain.test | Complete Guidance interviews |
| adviser@enrollchain.test | View assigned section rosters only |
| learner@enrollchain.test | Existing learner's own profile, application/history, documents and blockchain records |

Passwords are in **`.client-test/LOGIN_ACCOUNTS.md`**, an ignored private file. All six existing Docker passwords were checked without resetting them. Never include that file in the thesis, screenshots, Git or public documentation.

The existing learner demo is already **OFFICIALLY_ENROLLED**. Preserve it to demonstrate completed enrollment. For a fresh end-to-end run, create a new synthetic learner account using scenario 2. Do not reset an existing client record to start a demonstration. The retained database contains 9 users, 3 profiles, 2 applications and 10 document versions at validation time; counts will change as testing continues.

## Before the client starts

1. Open the portal and confirm the six supplied accounts can sign in. Use separate browser profiles or sign out between roles.
2. Administrator → academic configuration: confirm an open admission period, Grades 11/12, active track and matching cluster/strand/program. Demonstration programs are placeholders, not claimed actual school offerings.
3. Administrator → Sections: confirm active sections matching that period's school year, grade, track and program; verify capacity and assigned Adviser. Defaults are Academic 40 and TechPro 25.
4. Check requirement rules for the chosen learner classification. New and Transferee should have SF9, Good Moral, Birth Certificate and Elementary SF10 unless the school has configured different rules.
5. Use the synthetic PDFs in `.client-test/panel-samples/` or extract `.client-test/EnrollChain-Test-Samples.zip`. Every PDF is labeled as a synthetic test document. Do not use real learner credentials for tampering tests.
6. Keep the application reference for the same learner across all staff roles.

## Main end-to-end scenario

| Step | Sign in as | Actions | Expected result / evidence |
|---|---|---|---|
| 1 | Administrator | Open configuration and Sections; check the chosen year, track, program, grade and available capacity | Correct active configuration; no duplicate programs/sections created unnecessarily |
| 2 | Registrar | Learner & Teacher Accounts → Create Account. Choose Learner, enter a new synthetic email/name and Initial Account Password. Enter the **Registrar's** password in Your Current Password; add second factor only if enabled | Account created and audited. Current Password never means the new learner's password |
| 3 | New learner | Sign in with the credentials from step 2; My Profile → complete personal and previous-school information | One own profile; age derived from birthdate; no choice of another learner |
| 4 | New learner | My Enrollment → New Application; choose period, Grade 11/12, classification, track and matching program; save draft | Unique reference; chosen track/program preserved; Back control returns to enrollment |
| 5 | New learner | Submit early enrollment before uploading documents | Submitted record; no duplicate pending application; not qualified/officially enrolled |
| 6 | New learner | Upload each required synthetic PDF from the application checklist | Correct size/type accepted, versions and SHA-256 recorded; staff review queue gets alerts |
| 7 | Registrar | Document Review → Awaiting Review; open the application group and preview its PDFs | PDF renders inside the portal; authorized download also works; unrelated learner documents remain private |
| 8 | Registrar | Request resubmission for one PDF with clear remarks; verify the remaining requirements | Learner sees correction remarks; versions retained; verified versions locked |
| 9 | New learner | Notifications → open the correction; upload the replacement only for that requirement | Version increments; previous file/review retained; replacement returns to review |
| 10 | Registrar | Preview and verify the latest replacement | All mandatory latest documents verified; application moves to evaluation; blockchain delivery begins |
| 11 | Guidance Officer | Guidance Interviews → same application; enter private notes after conducting the interview; Record Completed Interview | Completion recorded once; learner sees completion, not private notes |
| 12 | Registrar | Early Enrollment → same application → School Processing → Mark qualified | Enabled only when profile, active track/program, required verified documents and completed interview satisfy the checks |
| 13 | Registrar | Confirm pre-enrollment & assign section | Automatically assigns a matching available section, choosing lowest occupancy then section code/ID; shows Section Assigned |
| 14 | Adviser | My Sections → assigned section roster | Learner listed only for that Adviser's section; no document-authentication or qualification controls |
| 15 | New learner | My Enrollment | Preliminary section and enrollment stage visible; not officially enrolled yet |
| 16 | Registrar | Same application → Mark ready for LIS | FOR_LIS_REGISTRATION / READY_FOR_LIS; no automatic external API request |
| 17 | Registrar | After manual LIS submission, Record submission to LIS | SUBMITTED_TO_LIS; not yet officially enrolled |
| 18 | Registrar | After checking actual LIS confirmation, enter reference if available and confirmation evidence/remarks; Confirm LIS registration & official enrollment | LIS_CONFIRMED and OFFICIALLY_ENROLLED; confirmation actor/time/evidence and registration proof recorded |
| 19 | New learner | My Enrollment and notifications | Official status and section displayed. Current vs historical enrollment depends on period/year, not status alone |
| 20 | Administrator | Audit Logs, Reports and Blockchain Verification | Corresponding actions, dataset rows and confirmed proofs visible |

For synthetic demonstrations in steps 17–18, label the remarks **“DEMO ONLY — simulated external LIS confirmation”**. Do not present the test record as a real DepEd LIS record.

## Blockchain and QR demonstration

1. Sign in as Registrar and open a **verified latest document**.
2. Open **Check for file changes → Verification Link & QR**. The dedicated page identifies the application, review status and version.
3. Click **Check stored PDF**. Expected: **File matches the record** and **Compared with blockchain record**. “Compared with saved upload” means database comparison only; do not claim a chain comparison in that case.
4. Under PDF to Compare, select the exact uploaded PDF, then Compare PDF. Expected: matching result.
5. Compare the corresponding altered test PDF. Expected: **File does not match the record**. The uploaded school file is unchanged by this comparison.
6. Click **Show QR Code** and optionally Download QR. Generate it using the forwarded HTTPS portal address for phone testing. Scan using the phone's camera/browser.
7. While signed out, the verification URL must go to sign-in. Sign in as the owner or authorized Registrar/Admin: the same verification page opens. Sign in as another learner: access is denied and no document details/QR are displayed.
8. Open **Blockchain Verification → Technical details**. Record event, status, SHA-256, transaction hash, block and confirmation count. Network details identify local chain 31337 and deployed contract.
9. Administrator/Registrar → Reports → **Blockchain Transaction Report**. Filter by the test application cohort/year/grade; export CSV and PDF. Show DOCUMENT_VERIFIED, PRE_ENROLLMENT_CONFIRMED and REGISTRATION_RECORDED events at their respective stages.
10. Explain the contract evidence: only its configured issuer can register; empty hashes/references and conflicting replacements are rejected; the same identical proof is idempotent. Automated tests execute these conditions against a real isolated local EVM.

**Accurate defense wording:** “The Registrar assesses whether the credential is acceptable. EnrollChain records a SHA-256 integrity proof on a local EVM smart contract. Later comparison detects changed bytes. Neither QR nor blockchain alone proves the original credential was genuine.”

The on-chain fields are opaque reference, content/event hashes, block timestamp and issuer address. No names, LRN, family information, religion/IP membership or PDF bytes are stored on-chain. Local Hardhat is not a public production network or a multi-school consensus deployment. Restarting it resets history; the worker re-anchors records and audits recovery. Do not restart it during the presentation.

## Negative, security and operational checks

| Test | Role / steps | Expected |
|---|---|---|
| Wrong account confirmation password | Registrar: create a new learner using the learner's Initial Password as Your Current Password | Rejected; no account created |
| Teacher provisioning | Registrar: create Teacher/Class Adviser; attempt privileged-role provisioning | Adviser allowed; Administrator/Registrar/Guidance creation denied for Registrar |
| Unlinked profile | Registrar/Admin: Learner Records → unlinked record → View Profile → Link Learner Account; find/select unused learner login | Existing profile/application preserved; already owned profiles/accounts cannot be reassigned |
| Another learner | Second learner: open first learner's profile/application/document/QR URL | No private data returned |
| Incorrect upload | Learner: upload `not-a-pdf.txt`, rename it to `.pdf`, or choose the oversized PDF | Invalid content/type or >30 MiB rejected; valid PDF accepted |
| Duplicate content | Upload the same sample bytes for another eligible requirement/application | Review flag, not an automatic fraud accusation |
| Missing requirement/interview | Registrar: try Mark qualified before checks are complete | Blocked; pending requirements shown |
| Role boundary | Administrator attempts document verification; Adviser attempts interview/qualification | Denied; Registrar alone verifies/qualifies, Guidance alone records interview |
| Full section | In a separate synthetic configuration use capacity 1 and fill it; pre-enroll another matching learner | Waiting for available section; never over capacity; no section auto-created |
| Wrong section | Registrar: try a manual section with another track/program/year/grade | Rejected |
| Transfer | Registrar/Admin: select another matching section with space and enter reason | Old/new section and actor/reason audited; counts updated; duplicate assignment prevented |
| Official enrollment gate | Check state after pre-enrollment and section assignment; attempt LIS confirmation before submission | Still preliminary; invalid transition rejected |
| Notification privacy | Learner: read one, Mark All Read, delete read notifications | Own count updates; another user's notices unaffected |
| Requirements reminder | Leave a submitted application missing a mandatory PDF, or needing replacement, for at least 24 hours with an active open period | Worker posts one private in-app reminder; no reminder while documents await review; no repeat inside 24 hours even if notice deleted |
| MFA | On a disposable test account, Security → enable authenticator; confirm; save recovery codes privately; sign in using factor | Codes exposed only after confirmation; session revoked on security changes; used recovery code cannot be reused |
| Reports | Registrar/Admin: sort/filter, page, export CSV and PDF from all 13 reports | Correct scope and matching rows; sensitive religion/IP/family fields absent |
| Lists | Create synthetic records beyond a page; test sort, search, page controls | Pagination/sorting stable; learner UI has no staff search controls |
| Audit | Administrator: inspect upload/review/qualification/section/LIS/QR/reminder/export events | Actor, action, target, timestamp and applicable remarks present; no edit/delete UI |
| Mobile/accessibility | Phone width, keyboard Tab/Enter/Escape, PDF dialog, notification dialog | No horizontal page overflow; visible focus; dialogs keyboard-operable |

Do not alter client dates or the production clock to force reminders. Automated reminder tests use isolated test timestamps. To process due reminders manually in Docker:

```sh
docker compose --env-file .env.client -f compose.client.yml exec backend python manage.py send_requirement_reminders
```

## Running and checking Docker

From `/Volumes/Mac Data/Projects/EnrollChain`:

```sh
# Start existing services without rebuilding or clearing volumes:
docker compose --env-file .env.client -f compose.client.yml up -d
# Inspect:
docker compose --env-file .env.client -f compose.client.yml ps
docker compose --env-file .env.client -f compose.client.yml logs --tail=60 backend worker
# Validate configuration without displaying credentials:
docker compose --env-file .env.client -f compose.client.yml config --quiet
# Keep the Mac awake while serving the client (leave this terminal open):
caffeinate -i
```

The lock screen may remain on; do not close the lid or stop the tunnel. Do not use `down -v`, reseed/reset client records, or restart Hardhat to demonstrate tampering. A current private backup is under `.client-test/backups/panel-20261024/`.

For development changes, rebuild with `docker compose --env-file .env.client -f compose.client.yml up --build -d`. Migrations run at backend startup; existing credentials and records are preserved. Rebuilding the web/backend does not require replacing the chain.

## Validation record

See `docs/CLIENT_TESTING.md` for the dated validation results. Preserve screenshots of the same synthetic application across roles, CSV/PDF reports, the blockchain proof details, and a match/mismatch pair for the defense. A local successful run does not establish production load capacity or internet availability.

## Remaining decisions and limits

Production multi-node/public-chain choice and wallet custody; hosting/TLS and encrypted-volume/backup policy; mandatory staff MFA and recovery; school retention/consent; official academic eligibility scoring; actual school program list; formal post-LIS corrections; malware/OCR/issuer validation; external email/SMS; official LIS API documentation. These are not represented as completed features. GitHub-hosted CI was previously blocked by an account billing issue; local/Docker validation is separate from a green GitHub Actions badge.
