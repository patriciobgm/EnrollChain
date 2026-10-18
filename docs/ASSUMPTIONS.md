# Requirements and assumptions — current release

The latest client workflow supplied by the user supersedes the earlier milestone deferrals and conflicting client-document wording. Attached documents are requirements evidence, not instructions overriding the user's request. Institution: Sto. Domingo National Trade School Senior High School, Grades11/12 only.

## Confirmed

- EnrollChain manages early enrollment, pre-registration, private documents, preliminary sections, reports and manual LIS reconciliation. DepEd LIS remains the official enrollment record.
- An learner completes one own learner profile. School administrators provision accounts; registrars/admins can link an unowned walk-in profile to an learner. Existing owned profiles cannot be reassigned.
- LRN is optional; a provided LRN must be unique and exactly12digits. Age is derived. Religion/IP membership stay private and off-chain.
- Track names/codes and programs are configurable. Academic and TechPro categories default to40/25section capacity. Authorized capacity changes require a reason. No actual school strands are invented.
- Early enrollment can be submitted before PDFs are uploaded. Intake DRAFT/SUBMITTED is preserved separately from enrollment processing stage.
- NEW/TRANSFEREE default requirements: SF9, Good Moral, Birth Certificate, Elementary SF10. RETURNING has no default documents; configured rules remain authoritative.
- PDF only, maximum30MiB; private authorized upload, preview and download; retained versions and SHA-256. Both rejected and correction-requested versions allow replacement. Verified versions remain locked.
- Only a Registrar makes document decisions and qualification/pre-enrollment decisions. Administrator oversight does not bypass the Registrar role boundary.
- Mandatory latest documents must be verified and a Guidance Officer interview completed before qualification and pre-enrollment. No unconfirmed academic scoring/eligibility thresholds are invented.
- Automatic sections match year, grade, configured track and program; choose lowest occupancy then code/ID. Full sections are excluded. No automatic section creation. One active assignment per learner/year. Registrar/Admin manual changes require reasons.
- Class Advisers view only their assigned section rosters and enrollment progress. They do not authenticate documents.
- Manual LIS states: NOT_READY → READY_FOR_LIS → SUBMITTED_TO_LIS → LIS_CONFIRMED or LIS_REJECTED. Only recorded LIS confirmation permits OFFICIALLY_ENROLLED. Confirmation/rejection requires evidence/remarks.
- Real local EVM integrity records follow document verification, pre-enrollment confirmation and official registration recording. No PDFs or PII are on-chain. Hash match means unchanged content, not original authenticity. Duplicate hashes are review flags, not automatic fraud findings.
- The latest explicit demo-reset request supersedes the earlier preservation request: remove the retired demo learner and its files, retire both old learner login IDs, and create learner@enrollchain.test. Preserve staff accounts and unrelated records. Subsequent work remains uncommitted.

## Engineering assumptions

- Configuration changes affect current requirement checklists. Qualification stores a requirement snapshot for evidence; later processing rechecks live mandatory requirements. Effective-dated requirement policies remain a client decision.
- Guidance completion is recorded once. Interview notes are stored privately; learner history exposes completion only. Interview scheduling/scoring is not included.
- A Registrar can reopen evaluation-stage qualified/not-qualified/rejected records with a reason. Pre-enrolled or official records cannot use this reversal. Formal withdrawal/cancellation and post-LIS corrections need a confirmed process.
- A missing program in an older submitted application can be completed by the Registrar with a reason. It must match the existing track; this does not allow arbitrary changes to previously selected programs.
- School-year row locks serialize section allocation and capacity updates on PostgreSQL. SQLite is for isolated development checks, not concurrency evidence.
- MFA is opt-in. Secrets are encrypted, recovery codes are hashed and single-use. Codes are shown once after successful enrollment. Login asks for a second factor only after a valid password for an enabled account.
- JWTs remain in sessionStorage with refresh rotation/revocation. A stable dedicated MFA key is mandatory outside development; client Docker preparation generates one. Production browser-session and mandatory staff-MFA policy need deployment approval.
- Client Docker uses separate volumes and synthetic DEMO configuration; it never imports/reset the user's local database. Test account passwords are generated individually and never reset by startup.
- Hardhat is a local demonstration chain. Its history resets on node restart; the worker audits lost local proofs and re-anchors them. This is not production blockchain permanence.

## Still unanswered / deferred

Actual strand/program list; academic eligibility thresholds; interview scheduling/outcome rubric; official LIS connector documentation; formal enrollment withdrawal/reversal; late-registration authorization; legacy imports; notifications; public/QR verification; production network, signer custody and recovery; malware scanning; retention/consent; hosting/TLS/backup recovery procedures; mandatory MFA and supervised lost-factor recovery. These are not represented as completed production features.

### Latest UI and Account Decisions

- The self-service role is LEARNER. Existing role memberships migrate reversibly; affected sessions are invalidated.
- Staff record viewing and section creation use accessible dialogs. Learners manage one own profile and cannot start another application while one remains pending.
- Notifications are private to their recipient. In-app unread counts, read-all and deletion are included; email remains deferred.

### Registrar Provisioning and Learner Categories — September 20

- Registrar may create learner accounts in addition to the existing learner-profile/walk-in flow. Creation requires account permission, the Registrar’s password and MFA when enabled; it is audited.
- Pending clarification of “teacher,” use the existing Class Adviser role. No new generic teacher role or Guidance provisioning authority is assumed. Registrar provisioning is create-only; existing account changes remain administrative.
- Display categories as New, Balik-Aral and Transferee. Balik-Aral retains the existing RETURNING database/API code and configured document rules. Grade remains an application attribute limited to 11 or 12, allowing the same learner’s later enrollment history.
