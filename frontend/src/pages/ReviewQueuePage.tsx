import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DocumentReviewDialog } from "../components/DocumentReviewDialog";
import { ErrorMessage, Field, Page } from "../components/Form";
import { ReviewStatusBadge } from "../components/ReviewStatusBadge";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import type { ReviewQueue, ReviewStatus } from "../lib/admissions";
import { apiRequest } from "../lib/api";
import { can, useAuth } from "../lib/auth";
import { canDecideReviews, canViewReviews } from "../lib/reviews";

type QueueFilter = ReviewStatus | "ALL";
const filters: readonly { value: QueueFilter; label: string }[] = [
  { value: "PENDING", label: "Awaiting review" },
  { value: "RESUBMISSION_REQUESTED", label: "Corrections" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All documents" },
];

export function ReviewQueuePage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<QueueFilter>("PENDING");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState(false);
  const allowed = canViewReviews(user);
  const canReview = canDecideReviews(user);
  const queue = useQuery({
    queryKey: ["review-queue", filter, search, page],
    queryFn: ({ signal }) =>
      apiRequest<ReviewQueue>(
        `/documents/review-queue/?${new URLSearchParams({ status: filter, search, page: String(page) })}`,
        { signal },
      ),
    enabled: allowed,
    refetchInterval: reviewing ? false : 30_000,
  });
  function searchQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }
  if (!allowed)
    return (
      <Page title="Document review">
        <div className="panel" role="alert">
          Your account does not have access to document review.
        </div>
      </Page>
    );
  return (
    <Page title="Document review">
      <section
        className="mb-8 grid gap-6 rounded-3xl border border-brand/10 bg-brand-soft p-6 sm:grid-cols-[1fr_auto] sm:p-8"
        aria-label="Review workspace"
      >
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand">
            <ShieldCheck size={16} aria-hidden="true" />
            {canReview ? "Registrar workspace" : "Administrator oversight"}
          </div>
          <h2
            id="review-queue-heading"
            tabIndex={-1}
            className="font-display text-2xl font-semibold tracking-tight"
          >
            Every document deserves a careful review.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            {canReview
              ? "Review the latest submitted PDFs, leave clear feedback, and help learners complete their requirements."
              : "Follow document decisions and correction requests. Registrars record review decisions."}
          </p>
        </div>
        <div className="flex items-center gap-4 sm:border-l sm:border-brand/15 sm:pl-8">
          <span className="font-display text-5xl tabular-nums text-brand">
            {queue.data?.count ?? "—"}
          </span>
          <span className="max-w-24 text-xs leading-5 text-muted">
            documents in this view
          </span>
        </div>
      </section>
      <div className="panel mb-6 space-y-5">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter by review status"
        >
          {filters.map((item) => (
            <Button
              key={item.value}
              variant={filter === item.value ? "primary" : "ghost"}
              size="sm"
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value);
                setPage(1);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <form
          onSubmit={searchQueue}
          role="search"
          aria-label="Search review queue"
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <Field label="Search documents">
              <input
                type="search"
                value={searchInput}
                maxLength={150}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Learner name, application reference, or requirement"
              />
            </Field>
          </div>
          <Button type="submit" variant="outline">
            <Search aria-hidden="true" />
            Search
          </Button>
          <Button
            variant="ghost"
            onClick={() => void queue.refetch()}
            disabled={queue.isFetching}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </form>
      </div>
      <ErrorMessage error={queue.error} />
      {queue.isError && (
        <Button variant="outline" onClick={() => void queue.refetch()}>
          Try again
        </Button>
      )}
      {queue.isPending && (
        <LoadingState label="Loading document review queue…" />
      )}
      {queue.isSuccess && queue.data.results.length === 0 && (
        <section className="panel grid justify-items-center py-14 text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <ClipboardCheck size={26} aria-hidden="true" />
          </span>
          <h2 className="font-display text-2xl font-semibold">
            No documents in this view
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            {search
              ? "Try another learner name or reference, or choose a different review status."
              : "Newly submitted documents and requested replacements will appear here when available."}
          </p>
          {page > 1 && (
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => setPage(1)}
            >
              Return to first page
            </Button>
          )}
        </section>
      )}
      {queue.isSuccess && queue.data.results.length > 0 && (
        <>
          <p
            role="status"
            aria-live="polite"
            className="mb-3 text-xs text-muted"
          >
            {queue.data.count} matching documents · Page {page}
            {queue.isFetching ? " · Updating…" : ""}
          </p>
          <ul className="space-y-4" aria-label="Documents for review">
            {queue.data.results.map((document) => (
              <li key={document.id}>
                <article className="panel grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h2 className="text-base font-bold">
                        {document.requirement_name}
                      </h2>
                      <ReviewStatusBadge status={document.review_status} />
                    </div>
                    <p className="font-medium">{document.learner_name}</p>
                    <p className="mt-1 break-all font-mono text-xs text-muted">
                      {document.application_reference}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      Version {document.version} · {document.period_name} ·
                      Uploaded{" "}
                      {new Date(document.uploaded_at).toLocaleDateString()}
                    </p>
                    {document.review?.remarks && (
                      <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-brand/25 pl-3 text-sm leading-6 text-muted">
                        {document.review.remarks}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
                    {canReview && document.review_status === "PENDING" && (
                      <DocumentReviewDialog
                        document={document}
                        onOpenChange={setReviewing}
                      />
                    )}
                    {can(user, "view_application") && (
                      <Button asChild variant="ghost">
                        <Link to={`/applications/${document.application}`}>
                          Application & history
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
      {queue.data && queue.data.count > 0 && (
        <nav
          aria-label="Review queue pages"
          className="mt-6 flex items-center justify-between gap-4"
        >
          <Button
            variant="outline"
            disabled={!queue.data.previous || queue.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ArrowLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="text-xs text-muted">Page {page}</span>
          <Button
            variant="outline"
            disabled={!queue.data.next || queue.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </Page>
  );
}
