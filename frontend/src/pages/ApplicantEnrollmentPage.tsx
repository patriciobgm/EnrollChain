import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Enrollment, Paginated } from "../lib/admissions";
import { EnrollmentSummary } from "../components/EnrollmentSummary";
import { ErrorMessage, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { Pagination } from "../components/Pagination";
export function ApplicantEnrollmentPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["my-enrollment", user?.id, history, page],
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>(
        `/enrollments/?archive=${history}&page=${page}`,
      ),
  });
  const pending = useQuery({
    queryKey: ["unfinished-enrollment", user?.id],
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>("/enrollments/?pending=true"),
  });
  return (
    <Page title="My Enrollment">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div
          className="inline-flex rounded-xl border border-line bg-surface p-1"
          role="group"
          aria-label="Enrollment records"
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${history === value ? "bg-brand text-white" : "text-muted"}`}
              aria-pressed={history === value}
              onClick={() => {
                setHistory(value);
                setPage(1);
              }}
            >
              {value ? "Enrollment History" : "Current Enrollment"}
            </button>
          ))}
        </div>
        {!history && pending.data?.count === 0 && (
          <Link className="action" to="/applications/new">
            New application
          </Link>
        )}
      </div>
      <ErrorMessage error={query.error || pending.error} />
      {query.isPending && <LoadingState label="Loading enrollment…" />}
      {query.data?.count === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <h2 className="font-semibold">
            {history ? "No Past Enrollments" : "No Current Enrollment"}
          </h2>
          {!history && (
            <Link
              className="mt-4 inline-block text-sm font-semibold text-brand"
              to="/learners"
            >
              My Profile
            </Link>
          )}
        </div>
      )}
      <div className="space-y-6">
        {query.data?.results.map((app) => (
          <EnrollmentSummary key={app.id} app={app} />
        ))}
      </div>
      {query.data && query.data.count > 20 && (
        <Pagination page={page} count={query.data.count} onChange={setPage} />
      )}
    </Page>
  );
}
