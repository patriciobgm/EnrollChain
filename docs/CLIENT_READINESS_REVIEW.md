> Historical readiness review. For the October 24 implemented panel scope and validation, see [Pre-Oral Acceptance](PRE_ORAL_ACCEPTANCE.md) and [Client Testing](CLIENT_TESTING.md).

# EnrollChain client and research-defense readiness review

> Historical assessment: demo preservation and old accounts below were superseded by the latest explicit reset. Use [Client Testing](CLIENT_TESTING.md) for the current workflow and credentials.
Assessment date: 2026-09-12. This is a development assessment and proposed acceptance plan, not approval of unresolved business rules or a claim of production readiness.

## Verdict

EnrollChain has an implemented application-submission and document-review foundation. It is not yet a complete admission and registration system, and its core blockchain research contribution is not integrated. Completing the two authorized milestones does not establish completion of the broader client MVP.

The next priority is administration, account ownership, security and audit visibility, followed by confirmed admission/registration workflows and demonstrable blockchain integrity. Visual improvements must accompany those capabilities; new dashboards alone will not close the functional gaps.

## Evidence and limits

Reviewed the current accounts, admissions, audit and blockchain code, React routes/navigation, scope/assumptions/architecture, acceptance records and roadmap, together with all three client documents:

- `Scope of the system.doc`
- `Secure Blockchain.docx`
- `Research Proposal (Chapter 1-2)-CRISTEL M. VALDEZ.docx`

Documents supply requirements and research claims. The user's confirmed SHS scope, PDF-only restrictions and registrar-only review decisions take precedence over conflicting document examples.

Read-only inspection of the local database found six users, one the retired demo learner profile without an owner, her submitted application created by the administrator, and 36 audit events at inspection time. Counts are a snapshot. No users, passwords, applications or files were changed during this assessment. the retired demo learner’s requested reseed remains pending.

The existing acceptance report records 64 backend tests, 12 frontend unit tests and five browser tests passing. Those results were not rerun for this documentation-only assessment. Browser tests mock API responses; SQLite checks do not prove PostgreSQL concurrency. This assessment is not a penetration test or a school acceptance test.

## Findings against the reported problems

| Concern | Verified current behavior | Development required |
|---|---|---|
| No admin/superadmin page | Django administration exists at backend `/admin/`; React has no dedicated administration workspace. Django `is_superuser` exists, but current-user API omits this flag. | Separate school administration and technical superuser experiences, guarded by backend permissions. Ordinary administrators must not grant themselves superuser privileges. |
| No audit logs | Events are recorded and have read-only Django admin inspection. There is no React audit viewer. Model save/delete restrictions do not make the database tamper-proof against privileged SQL or bulk ORM writes. | Searchable, paginated, permission-controlled viewer; security-event coverage; protected audit retention and evidence of attempted changes. |
| No MFA/security | Password hashing, JWT refresh rotation, authorization and private downloads exist. No MFA flow, login throttling or failed-login audit appears in the reviewed login implementation. | Implement authentication lifecycle and security controls, including MFA enrollment/recovery and coverage of Django admin as well as API login. |
| Same modules for different roles | Shared routes and forms dominate; menu visibility changes with permissions. Document review has registrar actions and administrator oversight. | Role-specific landing pages, task queues, available actions and empty states. Preserve server-side ownership and permissions. |
| the retired demo learner absent for applicant | the retired demo learner’s `owner` is null; application creator is the administrator. Applicant queries correctly restrict records to learner ownership. Existing update validation prohibits ownership reassignment. | Explicit linked-account selection, an authorized/audited unowned-profile linking process, and a scoped demo reseed. Do not make all learners visible to applicants. |

Relevant implementation: `backend/config/urls.py`, `backend/config/settings.py`, `backend/apps/accounts/{views,serializers}.py`, `backend/apps/admissions/{serializers,permissions,views}.py`, `backend/apps/audit/{models,admin,services}.py`, `frontend/src/app/App.tsx`, `frontend/src/components/AppShell.tsx`, and `frontend/src/pages/LearnersPage.tsx`.

## Proposed delivery sequence and exit criteria

### A. Repair account ownership and produce reproducible demo data

- Back up the affected synthetic records and private files before a scoped the retired demo learner reset. Preserve all six users and their existing passwords, unrelated records, and audit history.
- Explicitly identify the intended applicant account; do not infer a real account relationship from matching names or an LRN alone.
- Replace raw applicant UUID entry with an authorized account selector and an explicit unlinked walk-in option. Show the linked account to authorized staff.
- Add a constrained service for linking an unowned learner; require authorization and an audit event. Reassignment of an already-owned learner needs a separate policy.
- Provide an idempotent demo seed command with clearly documented reset boundaries and synthetic PDFs.

Exit: the intended applicant sees the retired demo learner and her application; a second applicant cannot list, retrieve, alter or download the retired demo learner’s records; all existing users remain; repeated seeding does not create duplicates. Verify this with the real API and database.

### B. Administration, distinct role experiences, audit and security

| Workspace | Required purpose |
|---|---|
| Applicant | Own profile, current application, requirements, correction feedback and eventual admission/registration timeline. |
| Registrar | Walk-ins, record linking, review queue, permitted evaluation/registration work and student record lookup. |
| Administrator | User administration within delegated limits, academic configuration, oversight, audit and approved decision duties. |
| Superuser | Privileged account/permission administration and technical system oversight; distinguish from routine school administration. Prefer existing `is_superuser` over inventing a sixth school role. |
| Guidance Officer | Only confirmed interview responsibilities and assigned records. Until confirmed, explain unavailable duties rather than show applicant forms. |
| Class Adviser | Only confirmed class/roster responsibilities. No document decision powers under the confirmed registrar-only rule. |

- Build React configuration editors for school years, periods, programs and requirement rules. Keep Grades 11/12 and the two confirmed tracks fixed; program names remain configurable.
- Expose explicit capability information to the UI, while enforcing each action at the API. Prevent privilege escalation through user-management fields, groups and direct requests.
- Separate ordinary administrator and technical superuser test identities; preserve the existing account that currently combines both capabilities.
- Implement activation/deactivation, change password, chosen account-provisioning/signup policy, and a secure recovery flow. Invalidation must address existing sessions/tokens after security changes.
- Add MFA with enrollment confirmation, expiring challenges, replay prevention, protected secrets, one-use recovery codes, rate limits, secure reset and audit events. Proposed policy: require it for privileged staff; decide applicant policy separately. No login or recovery route should silently bypass enrolled MFA.
- Add failed-login logging and throttling, session expiry/revocation, reauthentication for privileged changes and a reviewed browser-token strategy.
- Add audit filters for actor, time, action and entity; link authorized record timelines. Never include passwords, tokens, document bytes, religion or IP membership in audit metadata. Protect exports separately if implemented.
- Correct proxy trust for client IP recording and review production settings, secret handling, TLS and security headers.
- Use accessible, responsive role layouts with tested keyboard operation, loading/error/empty states and useful task summaries. Avoid claiming universal accessibility from a small automated scan.

Exit: demonstrate each role's distinct tasks, direct-URL/API denials, MFA and recovery, deactivation/session behavior, and traceable configuration/account/review activity. A regular administrator cannot self-promote or make registrar-only document decisions.

Security acceptance should use a documented checklist informed by [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) and [logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) guidance. Passing project tests is not certification.

### C. Complete admission and registration after business-rule sign-off

- Define the status-transition matrix with trigger, authorized actor, preconditions, reason, applicant-visible text and reversal policy.
- Implement confirmed eligibility inputs, guidance interviews if required, final decisions, registration reference, registration record, and complete status history.
- Keep document review, eligibility, admission, registration and blockchain confirmation as separate concepts.
- Address correction/reopening of locked profiles, rejection consequences and late-registration exceptions explicitly.
- Snapshot or version effective requirements and eligibility rules so later configuration changes do not silently rewrite past decisions.
- Define manual section assignment first if approved; automatic assignment needs confirmed capacities, laboratory grouping, overflow and override behavior.
- Use official/temporary enrollment labels only when their LIS-related meaning and verification evidence are confirmed. Do not simulate LIS confirmation.

Exit: complete successful, rejected, returning, transferee, walk-in and correction scenarios. Concurrent requests cannot duplicate registration or bypass a decision prerequisite. Validate against PostgreSQL. Unconfirmed features must remain unavailable and clearly documented.

### D. Implement and demonstrate the blockchain contribution

Current `DevelopmentAnchor.sol` only validates local tooling and emits an event; its anchor function is not restricted to an authorized issuer. The backend provider has only a disabled implementation. Transaction models alone are not integration.

- Select a declared demonstration network, issuer authority, key custody, confirmation policy, and correction/revocation rules. Local Hardhat is acceptable for a declared feasibility demonstration; it is not independent multi-institution trust.
- Implement a contract with issuer authorization, stable references, integrity lookup, duplicate handling and an explicit correction/supersession model.
- Integrate verified document versions and approved admission/registration events as agreed. Keep personal data and files off-chain; use opaque references and canonical hashes for structured events.
- Add durable transaction dispatch, idempotency, pending/submitted/confirmed/failed states, retries and receipt reconciliation. Handle network unavailability and uncertain transaction outcomes without falsely displaying confirmation.
- Show transaction hash, chain ID, contract address, block, confirmation state and linked record in an authorized UI. Keep registrar verification distinct from chain confirmation.
- Compare an uploaded/presented file with the anchored version. Report MATCH, MISMATCH, NOT ANCHORED or UNAVAILABLE accurately.
- Add QR verification with a minimal privacy-reviewed payload, opaque identifiers, rate limits and explicit superseded/revoked states. No public learner profile or PDF URL.

Exit: real contract tests and integration tests prove an authorized write, unauthorized denial, receipt/lookup, identical-file match, altered-file mismatch, retry without duplicate issuance, and outage recovery. Show actual chain evidence rather than mocked transaction hashes.

### E. Complete operational outputs and research evidence

- Add the approved in-app notifications, applicant timeline, registrar/admin summaries, student record view and report exports. Agree report fields and access; email and legacy import remain separate scope decisions.
- Build live-stack browser tests that run React, Django, PostgreSQL, private storage and a test chain together. Retain fast unit/mocked UI tests as complementary coverage.
- Add security-negative tests, PostgreSQL race tests, contract tests, responsive/keyboard checks, and file/storage failure scenarios.
- Measure task completion, processing time, errors, review/correction counts and user feedback using a predefined protocol. Separate school staff waiting time from API latency and blockchain confirmation time.
- Compare the same workflow before/after digitization, and, where evaluating blockchain's additional value, compare the same digital workflow with/without anchoring. Otherwise faster forms cannot establish that blockchain caused the improvement.
- Prepare requirement-to-screen/API/test traceability, demonstration scripts, sanitized evidence, known limitations, user/admin manuals and school UAT sign-off.

Exit: repeatable full demonstration, agreed test results, actual participant findings where required by the study, and no unsupported benefit claims.

### F. Deployment acceptance before real learner data

- Finalize hosting, production PostgreSQL, private storage permissions/encryption, upload limits, malware-scanning policy, secrets and wallet management, HTTPS, monitoring and alerts.
- Demonstrate backup and restore of database, private documents and required chain/key state. Specify recovery ownership and recovery targets.
- Define retention, data access, consent/research handling and incident procedures with the school. The manuscript's exclusion of legal-policy research is not authorization to ignore operational data governance.
- Use distinct production accounts and credentials; do not deploy the shared synthetic demo password.

Exit: successful restore exercise, production configuration review, named operators, approved data handling and school acceptance. A research demonstration and production launch have different acceptance gates.

## Decisions needed from the client before dependent implementation

| Decision | Why it blocks completion |
|---|---|
| Final admission authority | School scope says administrator approval; broader MVP describes registrar approval. Existing registrar-only document review does not decide admission authority. |
| Eligibility and interviews | Required inputs, thresholds, exemptions, guidance duties and approval sequence are not confirmed. |
| Enrollment/LIS meaning | Need manual evidence versus actual integration, authority and conditions for official/temporary labels. |
| Section assignment | Document mentions 40 learners and 25 for TechPro laboratory, but grouping/overflow/overrides and authoritative algorithm are unresolved. |
| Adviser responsibilities | Earlier document mentions shared verification; user has explicitly confirmed registrar-only document decisions. Clarify separate completeness/roster duties without reversing that decision. |
| Account lifecycle | School provisioning versus signup, learner/account cardinality, walk-in claiming, identity checks and recovery ownership. |
| Exceptional changes | Profile correction, ownership reassignment, decision reversal, correction deadlines and late admission permissions. |
| Blockchain operating model | Demo versus production network, issuer keys, anchoring triggers, recovery, revocation and confirmation policy. |
| Outputs and migration | Exact reports, public QR data, notification channels, and whether legacy imports are included in delivery. |

These questions do not block ownership UX, role-specific administration, audit visibility and baseline security development.

## Research proposal corrections needed for a defensible presentation

1. Replace higher-education/university language with the confirmed Sto. Domingo National Trade School SHS Grades 11/12 context. Keep actual program names configurable.
2. Replace absolute claims such as eliminating fraudulent credentials or guaranteeing security with bounded, tested claims. Hash matching establishes consistency with a recorded version; genuine issuing-institution provenance still requires verification. NIST describes the external-input trust limitation in [Blockchain Technology Overview](https://nvlpubs.nist.gov/nistpubs/ir/2018/NIST.IR.8202.pdf).
3. Explain why blockchain adds value over signed records or protected database audit trails, including operator trust, key compromise, network governance and cost/latency trade-offs. The off-chain database and files remain critical dependencies.
4. Describe smart-contract automation exactly as implemented. A contract cannot independently inspect school-issued PDFs or decide off-chain eligibility without trusted inputs.
5. Define interoperability narrowly if only a QR verifier/API is demonstrated. Do not claim actual LIS or multiple-school integration without participating systems and tests.
6. Align the stated statistical hypotheses with the evaluation design. Descriptive surveys alone do not establish statistically significant security or efficiency improvements. Define outcomes and the comparative method with the research adviser, or revise the claims.
7. Verify the proposed respondent counts and eligibility, sampling/consent process, instruments and complete references. Treat the document's sample counts as planned, not completed research.
8. Measure predefined attack attempts blocked and tamper cases detected rather than unobservable real-world breaches prevented. Report failures and limitations, not only successful demonstrations.

## Final defense acceptance scenario

Using repeatable synthetic records: applicant signs in, finds the correct linked profile, submits required PDFs, registrar requests one correction, applicant replaces only that version, registrar verifies, system records and confirms real blockchain evidence, authorized staff complete the approved admission and registration sequence, applicant sees the timeline, panel verifies a privacy-safe QR reference and tests an altered PDF, administrator traces the audit history, and a second applicant is denied access. Include a failed transaction/retry and privileged MFA demonstration.

Completion means this scenario and its negative cases work against the real stack, the school accepts the workflows, and every research claim has corresponding evidence or an explicit limitation. A feature count, attractive dashboard or successful Solidity compilation does not establish that outcome.


## Subsequent implementation note

The findings above describe the pre-update snapshot. A subsequent readiness update delivers private PDF preview, distinct workspaces, administration/configuration, audit visibility, unowned-profile linking and opt-in MFA/session controls. the retired demo learner’s submitted application was preserved and linked, with all users/passwords retained. Registrar final admission authority has been confirmed. See [READINESS_ACCEPTANCE.md](READINESS_ACCEPTANCE.md) for implemented behavior, test evidence and remaining limits; the broader workflow/blockchain verdict still applies.
