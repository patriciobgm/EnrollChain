import { FilterDialog } from "../components/FilterDialog";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPermission, isAdministrator, type Paginated } from "../lib/access";
interface AuditEvent {
  id: string;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
}
function EventValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted">Not Set</span>;
  if (Array.isArray(value))
    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index}>
            <EventValue value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="space-y-3">
        {Object.entries(value).map(([key, item]) => (
          <div
            key={key}
            className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
          >
            <dt className="font-medium text-muted">
              {key
                .replace(/[_-]/g, " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase())}
            </dt>
            <dd className="min-w-0 break-words">
              <EventValue
                value={
                  key === "report" && typeof item === "string"
                    ? item
                        .replace(/[_-]/g, " ")
                        .replace(/\b\w/g, (letter) => letter.toUpperCase())
                    : item
                }
              />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span className="whitespace-pre-wrap">
      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
    </span>
  );
}
export function AuditPage() {
  const { user } = useAuth();
  const allowed =
    isAdministrator(user) && hasPermission(user, "audit.view_auditevent");
  const [filters, setFilters] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["audit", filters, page],
    queryFn: () =>
      apiRequest<Paginated<AuditEvent>>(
        `/audit-events/?${filters}&page=${page}`,
      ),
    enabled: allowed,
  });
  if (!allowed)
    return (
      <Page title="Audit Logs">
        <p role="alert">Audit access requires administrator permission.</p>
      </Page>
    );
  return (
    <Page title="Audit Logs">
      <div className="mb-5">
        <FilterDialog
          value={Object.fromEntries(new URLSearchParams(filters))}
          onApply={(values) => {
            setFilters(new URLSearchParams(values).toString());
            setPage(1);
          }}
        >
          {(draft, change) => (
            <>
              {[
                ["actor", "Actor Email"],
                ["action", "Action"],
                ["entity_id", "Record ID"],
                ["from", "From Date"],
                ["to", "To Date"],
              ].map(([name, label]) => (
                <Field label={label} key={name}>
                  <input
                    type={name === "from" || name === "to" ? "date" : "text"}
                    value={draft[name] ?? ""}
                    maxLength={150}
                    onChange={(e) =>
                      change({ ...draft, [name]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </>
          )}
        </FilterDialog>
      </div>
      <ErrorMessage error={query.error} />
      {query.isPending && <LoadingState label="Loading audit events…" />}
      {query.data && (
        <>
          <p role="status" className="mb-3 text-sm text-muted">
            {query.data.count} events · Page {page}
          </p>
          {query.data.results.length === 0 && (
            <div className="panel">No events match these filters.</div>
          )}
          <ol className="space-y-3">
            {query.data.results.map((event) => (
              <li key={event.id} className="panel">
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="font-bold">
                    {event.action.replaceAll("_", " ")}
                  </h2>
                  <time
                    className="text-sm text-muted"
                    dateTime={event.created_at}
                  >
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </div>
                <p className="mt-2 text-sm">
                  {event.actor ?? "Unknown account / system"}
                </p>
                <p className="mt-2 break-all font-mono text-xs text-muted">
                  {event.entity} · {event.entity_id || "No record reference"}
                </p>
                {Object.keys(event.metadata).length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer py-2">
                      Event Details
                    </summary>
                    <div className="rounded-xl border border-line bg-canvas p-4">
                      <EventValue value={event.metadata} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex justify-between">
            <Button
              variant="outline"
              disabled={!query.data.previous}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!query.data.next}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
