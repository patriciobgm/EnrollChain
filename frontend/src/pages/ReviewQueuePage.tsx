import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, Fragment } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canDecideReviews, canViewReviews } from "../lib/reviews";
import type { Paginated, ReviewQueue, ReviewStatus } from "../lib/admissions";
import { DocumentReviewDialog } from "../components/DocumentReviewDialog";
import { PdfPreviewDialog } from "../components/PdfPreview";
import { ReviewStatusBadge } from "../components/ReviewStatusBadge";
import { SortableHeader } from "../components/SortableHeader";
import { Pagination } from "../components/Pagination";
import { ErrorMessage, Field, Page } from "../components/Form";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
type QueueFilter = ReviewStatus | "ALL";
const filters: { value: QueueFilter; label: string }[] = [
  { value: "PENDING", label: "Awaiting Review" },
  { value: "RESUBMISSION_REQUESTED", label: "Corrections" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All Documents" },
];
interface Group {
  application: string;
  reference: string;
  learner_name: string;
  period_name: string;
  document_count: number;
  uploaded_at: string;
}
export function ReviewQueuePage() {
  const { user } = useAuth();
  const allowed = canViewReviews(user);
  const canReview = canDecideReviews(user);
  const [filter, setFilter] = useState<QueueFilter>("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("name");
  const [selected, setSelected] = useState<string | null>(null);
  const [documentPage, setDocumentPage] = useState(1);
  const [reviewing, setReviewing] = useState(false);
  const queue = useQuery({
    queryKey: ["review-queue", filter, search, page, ordering],
    enabled: allowed,
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Group>>(
        `/documents/review-queue/?${new URLSearchParams({ status: filter, search, page: String(page), ordering, group: "application" })}`,
        { signal },
      ),
    refetchInterval: reviewing ? false : 30000,
  });
  const documents = useQuery({
    queryKey: ["review-queue", "documents", selected, filter, documentPage],
    enabled: allowed && !!selected,
    queryFn: () =>
      apiRequest<ReviewQueue>(
        `/documents/review-queue/?${new URLSearchParams({ application: selected!, status: filter, page: String(documentPage) })}`,
      ),
  });
  function searchQueue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearch(String(new FormData(e.currentTarget).get("search")));
    setPage(1);
    setSelected(null);
  }
  if (!allowed)
    return (
      <Page title="Document Review">
        <p role="alert">Document review access is required.</p>
      </Page>
    );
  return (
    <Page title="Document Review">
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        id="review-queue-heading"
        tabIndex={-1}
        aria-label="Review status"
      >
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "primary" : "outline"}
            aria-pressed={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setPage(1);
              setSelected(null);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <form
        onSubmit={searchQueue}
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        <div className="max-w-md flex-1">
          <Field label="Search Learner or Reference">
            <input type="search" name="search" maxLength={150} />
          </Field>
        </div>
        <Button variant="outline" type="submit">
          Search
        </Button>
        <Button variant="ghost" onClick={() => void queue.refetch()}>
          Refresh
        </Button>
      </form>
      <ErrorMessage error={queue.error} />
      {queue.isPending && <LoadingState label="Loading review queue…" />}
      {queue.data?.count === 0 && (
        <p className="panel">No documents in this view.</p>
      )}
      {!!queue.data?.count && (
        <div
          className="overflow-auto rounded-xl border border-line bg-surface"
          role="region"
          aria-label="Applications for Review"
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-soft">
              <tr>
                {[
                  ["Learner", "name"],
                  ["Reference", "reference"],
                  ["Documents", "documents"],
                  ["Oldest Upload", "uploaded"],
                ].map(([label, column]) => (
                  <SortableHeader
                    key={column}
                    label={label}
                    column={column}
                    ordering={ordering}
                    onSort={(value) => {
                      setOrdering(value);
                      setPage(1);
                      setSelected(null);
                    }}
                  />
                ))}
                <th scope="col" className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.data?.results.map((group) => (
                <Fragment key={group.application}>
                  <tr className="border-t border-line">
                    <td className="p-4">
                      <span className="font-semibold">
                        {group.learner_name}
                      </span>
                      <p className="mt-1 text-xs text-muted">
                        {group.period_name}
                      </p>
                    </td>
                    <td className="p-4 text-xs">{group.reference}</td>
                    <td className="p-4">{group.document_count}</td>
                    <td className="p-4">
                      {new Date(group.uploaded_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <Button
                        variant="outline"
                        aria-label={`View Documents for ${group.learner_name}`}
                        aria-expanded={selected === group.application}
                        onClick={() => {
                          setSelected(
                            selected === group.application
                              ? null
                              : group.application,
                          );
                          setDocumentPage(1);
                        }}
                      >
                        {selected === group.application
                          ? "Hide Documents"
                          : "View Documents"}
                      </Button>
                    </td>
                  </tr>
                  {selected === group.application && (
                    <tr>
                      <td
                        colSpan={5}
                        className="border-t border-line bg-canvas p-5"
                      >
                        <ErrorMessage error={documents.error} />
                        {documents.isPending && (
                          <LoadingState label="Loading requirements…" />
                        )}
                        <ul
                          aria-label="Documents for review"
                          className="space-y-3"
                        >
                          {documents.data?.results.map((document) => (
                            <li
                              key={document.id}
                              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4"
                            >
                              <div>
                                <h2 className="font-semibold">
                                  {document.requirement_name}
                                </h2>
                                {document.review?.remarks && (
                                  <p className="my-2 text-sm text-muted">
                                    {document.review.remarks}
                                  </p>
                                )}
                                <div className="mt-2 flex items-center gap-3">
                                  <ReviewStatusBadge
                                    status={document.review_status}
                                  />
                                  <span className="text-xs text-muted">
                                    Version {document.version}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {canReview &&
                                  document.review_status === "PENDING" && (
                                    <DocumentReviewDialog
                                      document={document}
                                      onOpenChange={setReviewing}
                                    />
                                  )}
                                <PdfPreviewDialog
                                  id={document.id}
                                  filename={document.original_filename}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                        {documents.data?.count === 0 && (
                          <p>No documents match this status.</p>
                        )}
                        {documents.data && documents.data.count > 20 && (
                          <Pagination
                            count={documents.data.count}
                            page={documentPage}
                            onChange={setDocumentPage}
                          />
                        )}
                        <Link
                          className="mt-4 inline-block font-semibold text-brand"
                          to={`/applications/${group.application}`}
                        >
                          Application &amp; History
                        </Link>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {queue.data && (
        <Pagination
          count={queue.data.count}
          page={page}
          onChange={setPage}
          busy={queue.isFetching}
        />
      )}
    </Page>
  );
}
