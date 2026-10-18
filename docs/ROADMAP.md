# Current release update

Milestones1–2 and readiness controls have been extended into the client-confirmed early-enrollment/sectioning/LIS-ready release. Current work is client acceptance testing and defect correction; this is not a production launch. See [Client testing](CLIENT_TESTING.md). Next steps are client acceptance/sign-off on actual academic offerings and workflows, production deployment/security and durable blockchain custody, then agreed integrations/notifications/reversal policies.

## Historical roadmap

# Development Roadmap

Milestone 1 (academic configuration, learner profiles, applications and secure uploads) and Milestone 2 (registrar review and targeted resubmission) are implemented. The user's 2026-09-12 role and resubmission answers govern Milestone 2. A readiness update now adds role workspaces, administration, audit visibility, account linking, opt-in MFA and private PDF preview; see READINESS_ACCEPTANCE.md. Registrar final admission authority is confirmed. The remaining phases below are a proposed sequence, not finalized business rules.

| Phase | Intended result | Decisions still required |
|---|---|---|
| 3 — Admission and registration | Guidance interviews, eligibility assessment, admission decisions, registration and history | Eligibility criteria; whether interviews are mandatory; reversal sequence and prerequisites (Registrar final approval is confirmed); class-adviser duties; late authorization; LIS/manual confirmation and section-assignment rules |
| 4 — Blockchain integrity | Verified-document anchoring, transaction/retry history, hash comparison and tamper demonstration | Development/testnet versus production target; wallet custody; who can anchor/revoke; confirmation/retry/recovery rules; what events are anchored |
| 5 — Tracking and outputs | QR verification, applicant notifications, operational dashboards and approved reports | Public QR payload; notification channels; report fields/formats; export permissions; whether legacy import is separately authorized |
| 6 — School acceptance and deployment | User acceptance testing, production access controls, storage/backups, deployment and operations | Hosting; privacy/consent/retention; real-data onboarding; recovery ownership; school acceptance criteria |

No eligibility thresholds, admission/registration decisions, LIS confirmation, section-capacity algorithms, public QR contents, production keys, notifications or report layouts were invented during Milestone 2.
