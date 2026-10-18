import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (String(value).trim()) params.set(key, String(value).trim());
    });
    setFilters(params.toString());
  }
  if (!allowed)
    return (
      <Page title="Audit Logs">
        <p role="alert">Audit access requires administrator permission.</p>
      </Page>
    );
  return (
    <Page title="Audit Logs">
      <form
        onSubmit={search}
        className="panel mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[
          ["actor", "Actor email"],
          ["action", "Action"],
          ["entity_id", "Record ID"],
          ["from", "From date"],
          ["to", "To date"],
        ].map(([name, label]) => (
          <Field label={label} key={name}>
            <input
              name={name}
              type={name === "from" || name === "to" ? "date" : "text"}
              maxLength={150}
            />
          </Field>
        ))}
        <Button className="self-end" type="submit">
          Apply filters
        </Button>
      </form>
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
                      Event details
                    </summary>
                    <pre className="overflow-auto rounded-lg bg-canvas p-3 text-xs">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
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
