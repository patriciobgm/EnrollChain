# Current scope — early enrollment client acceptance release

**EnrollChain = early enrollment + preliminary sectioning + document verification + reporting. DepEd LIS = official enrollment record.**

This release extends Milestones1–2 and the readiness work into the client-confirmed workflow. It preserves backend/, frontend/ and blockchain/ and the existing intake records. Earlier deferrals of sectioning, interviews, reports and manual LIS processing are superseded by the latest confirmation.

Included:

- School year/period, configurable tracks/programs and requirement rules; SHS Grades11/12.
- School-provisioned users, one learner profile, account linking, five role-specific workspaces and custom system administration. Django technical admin is not routed.
- Private PDF upload/preview/download, version history, registrar-only review/rejection/correction, validation/duplicate-content flags and integrity checks.
- Guidance interview completion, Registrar qualification/pre-enrollment, deterministic capacity-safe automatic sections, manual transfer/removal, adviser-scoped rosters.
- Separate intake/enrollment/LIS states; manual readiness/submission/confirmation with evidence. Official enrollment cannot result from pre-enrollment alone.
- Thirteen filtered report datasets (including blockchain transactions), CSV/PDF export, enrollment dashboard metrics and section utilization.
- Authorized QR/document verification pages and private scheduled requirements reminders.
- Real local EVM registry, durable transaction metadata, confirmation/retry monitoring and hash comparison. No on-chain PII or claim of original credential genuineness.
- MFA/security controls, permission-scoped administration, audit viewer, blue school branding, supplied school façade/seal and consolidated navigation.
- Isolated Docker client test stack with same-origin web/API access through one published port, synthetic accounts/configuration and private setup instructions.

See [confirmed requirements and open questions](ASSUMPTIONS.md), [architecture](ARCHITECTURE.md), [client testing](CLIENT_TESTING.md), and [implementation delivery](EARLY_ENROLLMENT_IMPLEMENTATION.md).

Not claimed: direct LIS connectivity; autonomous credential authenticity detection; production blockchain custody/permanence; complete production operational/security readiness. Client acceptance testing is the next validation stage.

Registrar account provisioning includes Learner and Teacher/Class Adviser creation, subject to Django permissions and password/MFA confirmation. Early Enrollment filters combine Grade 11/12 with New/Balik-Aral/Transferee. Existing RETURNING records display as Balik-Aral.

Panel review and client scenarios: [Pre-Oral Acceptance Guide](PRE_ORAL_ACCEPTANCE.md).
