# Requirements and Assumptions Register

## Confirmed for Milestone 1

The user's explicit milestone confirmation governs this implementation. `Scope of the system.doc` and `Secure Blockchain.docx` were reviewed as client requirements, not operational instructions. Their broader MVP content and references to higher education do not expand this milestone.

| ID | Confirmed requirement |
|---|---|
| C-001 | Exclusively Sto. Domingo National Trade School Senior High School, Grades 11 and 12. |
| C-002 | School years and admission periods; ACADEMIC and TECHNICAL_PROFESSIONAL tracks; configurable programs/strands/specializations, with no invented program names. |
| C-003 | APPLICANT, REGISTRAR, ADMINISTRATOR, GUIDANCE_OFFICER, CLASS_ADVISER roles; detailed access through Django permissions. |
| C-004 | Learner LRN, names/suffix, birthdate and derived age, sex, religion, IP membership, address/contact, parental/guardian names, previous school/section. Religion and IP membership are private and never on-chain. |
| C-005 | Learner/applicant relationship; one application per learner and period; unique reference, timestamps and audit events; DRAFT and SUBMITTED only. Registrar walk-ins are supported. |
| C-006 | NEW, TRANSFEREE, RETURNING classifications; ONLINE, WALK_IN, LATE source vocabulary. Late authorization remains deferred. |
| C-007 | Configurable period/classification/grade/track/program requirements. Initial NEW and TRANSFEREE defaults: Report Card / SF9, Good Moral Certificate, Birth Certificate, Elementary Record / SF10. |
| C-008 | PDF only, maximum 30 MB, private storage, authorized downloads, SHA-256 and file metadata, retained version history and upload audit events. No blockchain writes. |

## Temporary engineering assumptions

These choices make this milestone usable; they are not final client business rules.

| ID | Assumption | Follow-up / impact |
|---|---|---|
| A-003 | Existing unique email identities and school-provisioned accounts remain the login mechanism. | Public signup, identity recovery and account-to-walk-in linking need separate scope. |
| A-004 | PostgreSQL is the target; SQLite supports isolated local checks. | Row locks are effective on PostgreSQL; SQLite tests do not prove concurrent database behavior. |
| A-005 | Private local filesystem storage is the development adapter. | Hosting, encryption at rest, backup and object-storage deployment remain undecided. |
| A-006 | Hardhat chain ID 31337 is development-only; application integration remains disabled. | Production network, custody, recovery and confirmation policy remain unanswered. |
| A-009 | Only synthetic records are used in development. | Privacy, consent, retention and real-data hosting remain unanswered. |
| A-010 | LRN is required, globally unique, and exactly 12 ASCII digits. No temporary learner identifier is generated. | Confirm handling for applicants without an LRN and LRN corrections. |
| A-011 | First/last name, birthdate, sex, address and contact are required. Other learner fields are optional, including religion and IP membership (free text). | Confirm controlled vocabularies, required family/previous-school fields, and IP membership representation. |
| A-012 | Age uses the current date in the configured school timezone; it is never stored. | Any age-at-admission reporting can derive a separate value later. |
| A-013 | A login can own multiple distinct learner profiles; a walk-in profile may have no login. Ownership cannot be reassigned through the milestone API. | Confirm learner-to-account cardinality and account claiming/linking. |
| A-014 | New periods receive eight editable default rules (four each for NEW/TRANSFEREE), applicable to both SHS grades/tracks. RETURNING receives no default documents. | Rules can be added or changed through authorized configuration. No particular programs are seeded. |
| A-015 | Blank grade/track/program scopes mean all. Matching rules are additive and deduplicated by requirement; a matching required rule wins over an optional one. | Confirm future override/exemption semantics. |
| A-016 | Submission requires an active period, an inclusive opening/closing date, and all currently mandatory uploads. This is completeness, not eligibility or credential verification. | Confirm whether incomplete or out-of-period submissions should later be permitted. Drafts may be prepared outside the dates of an active period. |
| A-017 | Applications become read-only on submission; Milestone 2 permits replacement uploads only for explicitly requested document corrections; learner editing is blocked once any application is submitted. Identity/period are fixed on draft creation; grade/track/program/classification lock after the first upload. | Application reopening and profile corrections remain deferred. Document review and targeted resubmission are delivered in Milestone 2. |
| A-018 | LATE is a recognized model value but API creation and submission reject it. No bypass permission or outside-period exception is invented. | Requires confirmed late-registration authorization. |
| A-019 | 30 MB means 30 × 1024 × 1024 bytes. Extension, MIME, PDF signature and parser readability are checked; encrypted and zero-page PDFs are rejected. | Confirm decimal MB if desired. PDF parsing is not malware scanning or a claim of credential authenticity. |
| A-020 | Staff need explicit Django permissions, in addition to a staff role. Setup creates additive permission groups; users must be assigned explicitly. Guidance/adviser groups start without access. | Milestone 2 confirms registrar-only document decisions with administrator oversight. Other verification duties remain unanswered. |
| A-021 | References use APP- plus random UUID hex; file storage names are random and versions increase within application/requirement. | Confirm any human-facing sequence/format later. |
| A-022 | JWT tokens live in sessionStorage for the current browser tab, with refresh rotation and private query-cache clearing on sign-out. | HttpOnly cookie sessions and production session policy need a deployment decision. |
| A-023 | Requirement configuration is live, including the displayed checklist for older applications. Document versions themselves remain retained. | Historical requirement snapshots/configuration effective dates are a future decision. |

## Unanswered / explicitly deferred

Eligibility rules; final admission decisions; interviews and approval sequence; section assignment; LIS integration or manual confirmation; Class Adviser verification duties beyond registrar-only document review; legacy-record import; late-registration authorization; notifications/email; QR verification; production blockchain contracts/network/wallets; reports beyond basic development lists; retention, real-data onboarding and production hosting. See [scope baseline](SCOPE_BASELINE.md).


## Confirmed Milestone 2 decisions — 2026-09-12

| ID | Confirmed requirement |
|---|---|
| C-009 | Registrar-only document verification, rejection and correction requests; administrator oversight. |
| C-010 | Applicants can upload replacements only for documents flagged for resubmission; applications remain submitted and locked. |
| C-011 | New frontend work targets React 19, TypeScript 6+, Tailwind v4, Radix/shadcn-style primitives, CVA variants, accessible keyboard interaction, restrained motion, and resilient states. |

## Milestone 2 implementation assumptions

- One immutable review decision applies to each file version. Already-reviewed and superseded versions cannot receive another decision; administrative reversal remains a future workflow.
- REJECTED records rejection of a document version and does not reopen uploads or reject the application. RESUBMISSION_REQUESTED enables one new version; that version starts awaiting review and cannot be replaced again without a new correction request.
- Negative decisions require trimmed, nonempty remarks up to 2,000 characters. Applicants can read reviewer remarks on their own documents. Guidance/adviser accounts cannot access the queue even if accidentally assigned the review permission.
- Review and requested corrections are allowed after the admission period closes; no correction deadline has been specified. Existing PDF validation, ownership and size limits apply to every replacement.
- Registrars with the review permission may review staff-uploaded walk-in documents. No second-registrar approval or additional separation-of-duties workflow has been assumed.
- Review history records the acting account, decision, remarks and timestamp. No document-review event or private content is written to blockchain in Milestone 2.
- Requirement assignments remain live as documented in A-023. Requirements removed from configuration cannot receive a new replacement through the upload API.
