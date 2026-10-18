import { Link } from "react-router-dom";
import { Check, GraduationCap } from "lucide-react";
import { readable, type Enrollment } from "../lib/admissions";
const milestones = [
  "Application",
  "Documents",
  "Evaluation",
  "Pre-enrollment",
  "Section",
  "LIS Confirmation",
];
export function EnrollmentSummary({ app }: { app: Enrollment }) {
  const stage = app.enrollment_status;
  const rank =
    stage === "OFFICIALLY_ENROLLED"
      ? 6
      : stage === "FOR_LIS_REGISTRATION"
        ? 5
        : stage === "SECTION_ASSIGNED"
          ? 5
          : stage === "PRE_ENROLLED"
            ? 4
            : stage === "QUALIFIED"
              ? 3
              : stage === "FOR_EVALUATION"
                ? 2
                : stage === "DRAFT"
                  ? 0
                  : 1;
  const official = stage === "OFFICIALLY_ENROLLED";
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-panel">
      <div
        className={`flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 ${official ? "bg-brand-strong text-white" : "bg-brand-soft"}`}
      >
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
            <GraduationCap aria-hidden="true" />
          </span>
          <div>
            <p
              className={`text-xs font-semibold ${official ? "text-white/80" : "text-muted"}`}
            >
              {app.period_name}
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              {official ? "Officially Enrolled" : readable(stage)}
            </h2>
          </div>
        </div>
        <span className="text-sm font-semibold">Grade {app.grade_level}</span>
      </div>
      <div className="space-y-6 p-6 sm:p-8">
        <div>
          <p className="mb-2 text-xs text-muted">{app.reference}</p>
          <h3 className="text-lg font-semibold">
            {app.program_name || app.track_name}
          </h3>
          <p className="mt-1 text-sm text-muted">{app.track_name}</p>
        </div>
        <ol
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Enrollment progress"
        >
          {milestones.map((label, i) => (
            <li
              key={label}
              aria-current={rank === i ? "step" : undefined}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${rank > i ? "bg-brand text-white" : "border border-line text-muted"}`}
              >
                {rank > i ? <Check size={14} aria-label="Completed" /> : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <dl className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Section</dt>
            <dd className="mt-1 font-semibold">
              {app.section_assignment?.section_name || "Not Yet Assigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">LIS Status</dt>
            <dd className="mt-1 font-semibold">
              {readable(app.lis_record?.status || "NOT_READY")}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {official
              ? "LIS confirmation recorded by the school."
              : stage === "FOR_RESUBMISSION"
                ? "A document needs your attention."
                : stage === "DRAFT"
                  ? "Complete and submit your application."
                  : "Your early enrollment is being processed."}
          </p>
          <Link className="action" to={`/applications/${app.id}`}>
            {official
              ? "View Enrollment Record"
              : stage === "FOR_RESUBMISSION"
                ? "Upload Replacement"
                : "View application"}
          </Link>
        </div>
      </div>
    </article>
  );
}
