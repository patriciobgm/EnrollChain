# Assumptions Register

These are temporary engineering assumptions, not finalized client requirements.

| ID | Temporary assumption | Impact if changed | Status |
|---|---|---|---|
| A-001 | The system serves one institution. | Multi-tenant data isolation would require schema and authorization changes. | Awaiting client |
| A-002 | Applicant, registrar, and administrator are coarse roles; Django groups and permissions provide finer access control. | Role names and permission mappings can be changed without replacing authentication. | Awaiting client |
| A-003 | Email is the unique login identifier. | Another identifier would change account recovery and identity validation. | Awaiting client |
| A-004 | PostgreSQL is the target database; SQLite is permitted only for isolated local checks. | Little impact because access is through Django ORM. | Accepted technical default |
| A-005 | Uploaded files use private local storage in the prototype. | Object storage can replace the storage backend later. | Awaiting deployment decision |
| A-006 | Hardhat chain ID 31337 is used only for local development. | Testnet or managed-chain deployment requires separate configuration and key custody. | Awaiting client |
| A-007 | Blockchain processing must support pending, confirmed, and failed states. | Confirmation and retry policies remain configurable. | Awaiting client |
| A-008 | No personally identifiable information is written on-chain. | Any request to expose identifiers requires a privacy review. | Safety constraint |
| A-009 | No real student records are used until privacy, consent, retention, and hosting arrangements are approved. | Blocks production-data onboarding, not development with fixtures. | Awaiting client |

## Decisions intentionally not assumed

- Admission lifecycle and reversal rules
- Eligibility criteria and override authority
- Requirement lists by grade or program
- Student-number format
- Registration fields
- Public QR-verification contents
- Blockchain wallet ownership, target network, revocation, and confirmation policy
- Official report layouts and retention periods
