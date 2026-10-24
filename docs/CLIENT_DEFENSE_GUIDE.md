# EnrollChain: Client Testing and Defense Notes

Verified against the repository and Docker account checks on October 5, 2026. This describes the current client-test implementation, not a production certification. Keep the separate credential sheet private; it does not belong in the thesis or defense slides.

## 1. Purpose and scope

Suggested opening statement:

“EnrollChain is a blockchain-assisted early enrollment and document integrity system for Sto. Domingo National Trade School Senior High School, Grades 11 and 12. It supports learner information, configurable tracks and programs, private document submission, Registrar verification, preliminary section assignment, reporting and manually recorded LIS reconciliation. DepEd LIS remains the official enrollment record. Blockchain evidence lets the school compare a document with the fingerprint recorded when it was verified; it does not establish whether the original credential was genuine.”

The problem addressed is the school's need to organize and monitor early enrollment before official LIS enrollment is completed. Do not claim that every school's LIS deployment lacks a particular feature; frame the motivation as this client's reported operational need.

The release includes New, Balik-Aral and Transferee classifications, Grade 11/12 selection, and school-configured programs. Balik-Aral retains the internal RETURNING code so existing records and requirement assignments remain compatible. Actual school offerings must be configured by the school; DEMO programs are synthetic testing examples.

## 2. Accounts and authority

- learner@enrollchain.test — own profile, application, requirements, corrections, enrollment progress and own blockchain evidence.
- registrar@enrollchain.test — learner profiles/walk-ins, Learner and Teacher/Class Adviser account creation, document decisions, qualification, pre-enrollment, section assignment, LIS processing and reports.
- guidance@enrollchain.test — records interview completion; does not approve documents or qualify learners.
- adviser@enrollchain.test — assigned sections and rosters; does not receive private document-review powers.
- admin@enrollchain.test — school configuration, account administration within permissions, sections, reports, audit logs and document oversight. The Registrar role still controls document decisions and qualification.
- superadmin@enrollchain.test — Administrator role plus the superuser privilege flag; operational status and additional permission administration. It is not a separate ordinary learner/admission role.

All six accounts were active, MFA was not enabled, and all six JWT logins returned HTTP 200 at verification time. Passwords are in .client-test/LOGIN_ACCOUNTS.md. Enabling MFA or changing passwords later changes those conditions.

The existing learner account has one application at FOR_RESUBMISSION. Preserve it for correction testing. For a fresh start-to-finish test, Registrar can create a new Learner account through Learner & Teacher Accounts, then the learner completes their own profile. No additional ready-made learner accounts are claimed here.

Teacher currently maps to the existing Class Adviser role, pending clarification. This is not a complete teacher HR, payroll, subject assignment or scheduling module.

## 3. Workflow and decision gates

1. School staff provision a learner account, or a Registrar creates a walk-in profile and later links an unowned profile to an account.
2. The learner completes required personal and previous-education information.
3. The learner chooses admission period, grade, track, program and classification, saves a draft, then submits early enrollment.
4. The learner uploads configured requirements. Early enrollment submission may precede document upload.
5. The system validates files; Registrar reviews and verifies, rejects or requests correction. Replacements retain version history.
6. A Guidance Officer records completed interview. Private interview notes are not exposed to learners or advisers.
7. Registrar can qualify the learner only after required profile information, active track/program, verified latest mandatory documents and the completed interview satisfy the checks.
8. Registrar confirms pre-enrollment. Automatic assignment selects an eligible section with space; otherwise the learner waits for a section.
9. Authorized Registrar/Admin staff record LIS readiness, submission and confirmation. Confirmation requires evidence/remarks and is entered manually.
10. Only recorded LIS confirmation allows the application to become officially enrolled within EnrollChain.

Pre-enrollment and section assignment are preliminary school records. The system does not contact DepEd LIS or independently verify that a manually entered LIS confirmation is true. Staff remain responsible for the evidence entered.

Intake status remains DRAFT/SUBMITTED, while enrollment processing and LIS status are tracked separately. This preserves existing intake data instead of rewriting every historical status.

## 4. Section-assignment algorithm

The service validates eligibility and matches school year, Grade 11/12, selected track, selected program and active section status. It excludes full sections, chooses the lowest assigned count, then breaks ties by section code and ID. It does not automatically create sections.

Academic default capacity is 40; TechPro default capacity is 25. These are stored configuration values, with authorized, reason-logged overrides. Occupancy is derived from current assignments rather than maintaining a separate editable count.

Transactions and PostgreSQL row locks serialize assignment changes around the school year. A unique learner/year assignment constraint prevents duplicate active assignment. This is deterministic, rule-based balancing, not artificial intelligence and not academic merit ranking. Broad locking favors correctness but its throughput must be measured before large-scale claims.

Transfers/removals require authorization and reasons; capacity and matching rules are checked again. Changes are restricted after LIS submission/confirmation. SQLite local testing does not prove row-lock behavior; the Docker PostgreSQL concurrency test does.

## 5. Document controls

Uploads are PDFs only, up to 31,457,280 bytes (30 MiB). The backend checks type, size and PDF parsing, generates SHA-256, stores files privately, and records original filename, stored filename, MIME type, size, time and version.

Preview/download endpoints enforce authorization. Private media has no public URL. SHA-256 fingerprints identify identical bytes and detect differences. Duplicate content is a review warning, not an automatic finding of fraud; it does not reveal another learner's identity.

NEW and TRANSFEREE initially require SF9, Good Moral Certificate, Birth Certificate and SF10. Balik-Aral initially has no default documents under the current assumption; configured school requirements remain authoritative.

Registrar decisions apply to individual versions. Rejected/correction-requested versions can be replaced while preserving history. Verified versions cannot be replaced through the normal flow. The backend rechecks stored bytes before accepting verification.

Do not describe PDF parsing as malware scanning, OCR, signature authentication or document-issuer verification. Those features are not implemented.

## 6. Blockchain implementation

The current implementation is a real local Ethereum-compatible EVM node using Hardhat, chain ID 31337. The application calls a Solidity EnrollmentIntegrityRegistry through Python Web3. It is a single local demonstration node, not a multi-party consortium or a public production blockchain.

The registry stores an opaque reference, a 32-byte content/event-payload hash, an event-type hash, a blockchain timestamp and the issuer address. It does not store PDF bytes, names, LRN, addresses, religion, IP membership or readable personal profiles. Hashes should still be handled thoughtfully; their existence is not a blanket privacy/compliance guarantee.

Events include DOCUMENT_VERIFIED, PRE_ENROLLMENT_CONFIRMED and REGISTRATION_RECORDED. The document event uses the PDF's SHA-256. Enrollment event hashes are computed from serialized event data; they are not PDF hashes.

Only the contract's configured issuer can register records. A conflicting hash/event for an already recorded reference is rejected. Registering the same reference/hash/event again preserves the existing record. A database delivery record tracks transaction identity, block, confirmations and errors; failed delivery can be retried. A database audit trail is separate from the limited event set anchored on-chain.

SHA-256 is the application's file fingerprint algorithm. Do not describe it as the Ethereum transaction-hash algorithm, encryption, a digital signature, or a cryptocurrency.

## 7. Integrity demonstration

1. Keep an untouched copy of a synthetic PDF.
2. Submit it and have Registrar verify that version.
3. In Blockchain Verification, show the confirmed document event, transaction hash, block and contract/network details.
4. In the application's document history, use Check for File Changes and Check Stored PDF. Show “File matches the record” and “Compared with blockchain record.”
5. Compare the untouched original. The two displayed SHA-256 hashes should match.
6. Compare a separately edited, valid PDF. The result should say “File does not match the record,” with different hashes.
7. Compare the untouched original again to show it still matches and the comparison did not overwrite the stored submission.
8. For technical corroboration, inspect the transaction receipt and registry record through the read-only verification procedure already supplied.

Renaming an unchanged file does not change its hash. Re-exporting or editing metadata may change bytes even if the pages look identical. A mismatch means byte-level difference from the recorded version, not proof of a malicious intent or identification of who changed it.

“Compared with saved upload” is a database comparison; it must not be presented as an on-chain verification. Pending/Failed is not Confirmed. Unavailable blockchain evidence must not be presented as a successful chain verification.

## 8. Technical specifications

- Frontend: React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4.3.3, Vite 7.3.6 (repository lockfile versions).
- Interface primitives: Radix UI, CVA component variants, React Router and TanStack Query.
- PDF presentation: PDF.js 6.3.289 with a locally bundled worker.
- Backend: Python 3.13 Docker image; Django 5.2.17; Django REST Framework 3.16.1; Gunicorn 23.0.0.
- Database: PostgreSQL 17 in Docker; SQLite for local development. Private PDFs use a separate named file volume.
- Blockchain: Hardhat 3.15.0; Solidity compiler 0.8.28; local EVM chain 31337; Python Web3 8.0.0.
- Authentication: JWT access/refresh tokens, refresh rotation/revocation and session-version checks. Browser tokens currently use sessionStorage.
- MFA: optional TOTP, encrypted MFA secrets and hashed, one-use recovery codes. It is implemented but not enabled by default for the test accounts.
- Authorization: server-enforced role boundaries, Django permissions, ownership scoping and adviser-section scoping.
- Reports: one shared report dataset layer produces JSON/CSV/PDF; PDF export uses ReportLab 5.0.1.
- API documentation: generated OpenAPI schema with validation.
- Deployment: Docker Compose runs Nginx web, Django backend, PostgreSQL, Hardhat and the blockchain worker. Only web port 8080 is published; forwarding supplies remote access.

The data model reuses learner, application, year/period, configurable track/program, requirements, document submissions/reviews, section/assignment, interview, enrollment event, LIS record, blockchain transaction, audit and notification entities.

## 9. Reports and traceability

The thirteen reports are Early Enrollment Master List; Enrollment by Track; Enrollment by Cluster/Strand; Enrollment by Section; Section Master List; Section Capacity/Utilization; Unassigned Learners; Pending Document Verification; Pre-Enrolled Learners; Learners for LIS Registration; LIS Confirmed Learners; Registration Status Summary; Blockchain Transaction Report.

Filters include applicable school year, grade, track/program, enrollment/LIS status and learner classification. Submitted master-list data excludes unsent drafts. Category/section summaries aggregate records, while learner-list reports show individual records. CSV and PDF exports use the same underlying datasets as the report view.

Audit records provide actor/action/target/time and relevant changes. They are not editable through the normal audit UI, but they are database records: do not call every audit event independently immutable or blockchain-backed.

## 10. Test evidence and research claims

October 5 validation: 111 backend tests passed inside the rebuilt image on an isolated PostgreSQL database with a real isolated EVM node, including simultaneous section allocation and integrity match/mismatch. Frontend validation passed 20 unit tests, 10 browser workflow tests and 43 Docker role/page checks. All 12 report types responded as JSON, CSV and PDF. Schema, lint, builds, migrations/rollback/reapply, Compose and fresh Solidity compilation passed.

The existing six client accounts, one learner/application and four private PDFs were retained. All four stored-file hashes matched; both existing verified documents matched the on-chain hashes. Readiness records and screenshots are available privately in .client-test/.

Automated tests are engineering evidence, not a user-acceptance result, penetration-test certification, proof of legal compliance or a performance benchmark. Do not invent respondent counts, accuracy percentages, fraud-detection rates, processing-time reductions, satisfaction scores or statistically significant findings. Those require an actual documented study.

For client UAT, record the case, role, inputs, expected/actual result, screenshot and application reference. Demonstrate both successful and rejected actions.

## 11. Questions the panel may ask

Why blockchain instead of only a database? A separately operated chain can provide an additional check against changes to an accepted fingerprint. A database remains necessary for private records and workflow. This local single-operator demonstration shows the mechanism, but does not establish organizational independence or production decentralization.

Can it detect fake credentials? It can flag identical file content and detect changes relative to a recorded fingerprint. It cannot determine original authenticity from hashing alone. Registrar review remains essential.

Can the same operator tamper with everything? The current local operator controls the infrastructure and could reset the chain. Independent validator governance, durable storage, signer custody and operational controls are future production decisions. Do not call the demonstration tamper-proof against its own operator.

Does it connect to DepEd LIS? No. It prepares reports and records authorized manual LIS processing/evidence through a replaceable service abstraction. Official integration needs approved documentation and authorization.

What if two learners claim the last seat? PostgreSQL transaction locks serialize allocation and enforce capacity, backed by uniqueness constraints. The concurrent test verifies one succeeds and one waits when one seat remains.

What happens during blockchain downtime? Delivery state remains pending/failed and is retryable; chain verification can report unavailable. A school workflow state must not be mistaken for proof that its blockchain transaction already succeeded.

Does a hash match prove a person graduated? No. It shows that the compared file bytes match the recorded fingerprint. Identity, issuer legitimacy and credential content require separate verification.

Why are there no tokens or student wallets? The feature records integrity evidence using a system issuer. It does not require cryptocurrency issuance or wallets for learners.

Is it production ready? It is a tested client-acceptance build. A production network, signer custody, security review, deployment/backup recovery procedures, school governance and further UAT are still required.

## 12. Limits and presentation reminders

The current Hardhat chain loses history on node restart. Local reconciliation audits missing proofs and re-anchors them; this is not preservation of the original chain history. Keep the node running during the demonstration and do not promise permanent public-chain availability.

There is no direct LIS connector, autonomous document-authenticity engine, OCR verification, antivirus scanner, public QR verification, email notification service or legacy import in this release. In-app notifications are implemented. Eligibility scoring, interview scheduling/outcome rubrics, formal withdrawal and post-LIS corrections remain outside the confirmed implementation.

No specific minimum hardware or supported concurrent-user capacity has been benchmarked. Report the tested deployment environment, not invented hardware requirements or user-capacity guarantees. Automated accessibility checks do not establish complete accessibility certification.

Suggested demonstration order: learner profile/application, correction/version history, verified PDF preview, original-versus-edited integrity check, Guidance completion, Registrar qualification, section assignment, manually evidenced LIS confirmation, reports, audit trail, role isolation.

Keep credentials and private records out of defense slides. Do not present synthetic LIS evidence or DEMO programs as real official enrollment or approved school offerings.

## October 24 Panel Update

The system now includes authenticated QR document verification, private daily requirements reminders, and a Blockchain Transaction Report (13 reports total). These do not change Registrar authentication responsibility or the distinction between pre-enrollment and LIS-confirmed enrollment. Use [the current panel and end-to-end guide](PRE_ORAL_ACCEPTANCE.md) for updated evidence and boundaries.
