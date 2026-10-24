import { FilterDialog } from "../components/FilterDialog";
import { BackLink } from "../components/BackNavigation";
import { SortableHeader } from "../components/SortableHeader";
import { ApplicantEnrollmentPage } from "./ApplicantEnrollmentPage";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { ErrorMessage, Field, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { readable, type Enrollment, type Paginated } from "../lib/admissions";
import { can, useAuth } from "../lib/auth";
export function EnrollmentDetailPage() {
  const { id } = useParams();
  return (
    <Page title="Enrollment processing">
      <BackLink to="/applications" className="mb-5">
        Back to Early Enrollment
      </BackLink>
      {id && <EnrollmentPanel id={id} />}
    </Page>
  );
}
export function ApplicationsPage() {
  const { user } = useAuth();
  const unfinished = useQuery({
    queryKey: ["unfinished-enrollment", user?.id],
    enabled: user?.role === "LEARNER",
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>("/enrollments/?pending=true"),
  });
  const [ordering, setOrdering] = useState("name");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [grade, setGrade] = useState("");
  const [classification, setClassification] = useState("");
  const query = useQuery({
    queryKey: [
      "enrollments",
      search,
      page,
      status,
      ordering,
      grade,
      classification,
    ],
    enabled: user?.role !== "LEARNER",
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>(
        `/enrollments/?${new URLSearchParams({ search, page: String(page), status, ordering, grade_level: grade, classification })}`,
      ),
  });
  if (user?.role === "LEARNER") return <ApplicantEnrollmentPage />;
  return (
    <Page
      title={
        user?.role === "GUIDANCE_OFFICER"
          ? "Guidance Interviews"
          : "Early Enrollment"
      }
    >
      <div className="mb-5 flex flex-wrap items-end gap-3 [&>.field]:basis-full sm:[&>.field]:basis-auto sm:[&>.field]:grow">
        <Field label="Search learner / reference">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            type="search"
          />
        </Field>
        <FilterDialog
          value={{ grade_level: grade, classification, status }}
          onApply={(value) => {
            setGrade(value.grade_level ?? "");
            setClassification(value.classification ?? "");
            setStatus(value.status ?? "");
            setPage(1);
          }}
        >
          {(draft, change) => (
            <>
              <Field label="Grade Level">
                <select
                  value={draft.grade_level ?? ""}
                  onChange={(e) => {
                    change({ ...draft, grade_level: e.target.value });
                  }}
                >
                  <option value="">All Grades</option>
                  <option value="11">Grade 11</option>
                  <option value="12">Grade 12</option>
                </select>
              </Field>
              <Field label="Learner Classification">
                <select
                  value={draft.classification ?? ""}
                  onChange={(e) => {
                    change({ ...draft, classification: e.target.value });
                  }}
                >
                  <option value="">All Classifications</option>
                  <option value="NEW">New</option>
                  <option value="RETURNING">Balik-Aral</option>
                  <option value="TRANSFEREE">Transferee</option>
                </select>
              </Field>
              <Field label="Enrollment stage">
                <select
                  value={draft.status ?? ""}
                  onChange={(e) => {
                    change({ ...draft, status: e.target.value });
                  }}
                >
                  <option value="">All stages</option>
                  {[
                    "DRAFT",
                    "FOR_DOCUMENT_VERIFICATION",
                    "FOR_RESUBMISSION",
                    "FOR_EVALUATION",
                    "QUALIFIED",
                    "NOT_QUALIFIED",
                    "PRE_ENROLLED",
                    "SECTION_ASSIGNED",
                    "FOR_LIS_REGISTRATION",
                    "OFFICIALLY_ENROLLED",
                    "REJECTED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {readable(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </FilterDialog>
        {can(user, "add_application") &&
          (user?.role !== "LEARNER" || unfinished.data?.count === 0) && (
            <Link className="action" to="/applications/new">
              New application
            </Link>
          )}
      </div>
      <ErrorMessage error={query.error || unfinished.error} />
      {query.isPending && <LoadingState label="Loading early enrollment…" />}
      {query.data?.count === 0 && (
        <p className="panel mb-6">
          No matching applications.{" "}
          {user?.role === "LEARNER" && (
            <Link to="/learners" className="text-brand underline">
              Complete your profile to get started.
            </Link>
          )}
        </p>
      )}
      {user?.role !== "LEARNER" ? (
        <div
          className="overflow-auto rounded-xl border border-line bg-surface"
          role="region"
          aria-label="Early enrollment records"
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-soft">
              <tr>
                {[
                  ["Learner / Reference", "name"],
                  ["Grade / Program", "grade"],
                  ["Section", "section"],
                  ["Stage", "stage"],
                ].map(([label, column]) => (
                  <SortableHeader
                    key={column}
                    label={label}
                    column={column}
                    ordering={ordering}
                    onSort={(value) => {
                      setOrdering(value);
                      setPage(1);
                    }}
                  />
                ))}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data?.results.map((app) => (
                <tr key={app.id} className="border-t border-line">
                  <td className="p-4">
                    <span className="font-semibold">{app.learner_name}</span>
                    <p className="text-xs text-muted">{app.reference}</p>
                    <p className="text-xs text-muted">
                      {readable(app.classification)}
                    </p>
                  </td>
                  <td className="p-4">
                    Grade {app.grade_level}
                    <p className="text-muted">
                      {app.program_name || app.track_name}
                    </p>
                  </td>
                  <td className="p-4">
                    {app.section_assignment?.section_name || "Unassigned"}
                  </td>
                  <td className="p-4">
                    <span className="badge">
                      {readable(app.enrollment_status)}
                    </span>
                  </td>
                  <td className="p-4">
                    <Link
                      className="action secondary"
                      to={
                        can(user, "view_application")
                          ? `/applications/${app.id}`
                          : `/enrollments/${app.id}`
                      }
                    >
                      View application
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {query.data?.results.map((app) => (
            <article
              key={app.id}
              className="panel flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h2 className="font-bold">{app.learner_name}</h2>
                <p className="break-all text-sm text-muted">{app.reference}</p>
                <p>
                  Grade {app.grade_level} · {app.track_name} ·{" "}
                  {app.program_name ?? "Program not selected"}
                </p>
                <p className="text-sm text-muted">
                  {app.section_assignment?.section_name ??
                    "No section assigned"}{" "}
                  · {readable(app.lis_record?.status ?? "NOT_READY")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="badge">{readable(app.enrollment_status)}</span>
                <Link
                  className="action secondary"
                  to={
                    can(user, "view_application")
                      ? `/applications/${app.id}`
                      : `/enrollments/${app.id}`
                  }
                >
                  View application
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {query.data && query.data.count > 20 && (
        <div className="mt-5 flex items-center gap-4">
          <button
            className="action secondary"
            disabled={!query.data.previous}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="action secondary"
            disabled={!query.data.next}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </Page>
  );
}
