import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { FilterDialog } from "../components/FilterDialog";
import { SortableHeader } from "../components/SortableHeader";
import { Button } from "../components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/Dialog";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { readable } from "../lib/admissions";
import { useAuth } from "../lib/auth";
interface Proof {
  id: string;
  record_type: string;
  record_hash: string;
  opaque_reference: string;
  status: string;
  transaction_hash: string;
  block_number: number | null;
  confirmations: number;
  error_message: string;
  created_at: string;
}
interface ProofPage {
  results: Proof[];
  next: string | null;
  previous: string | null;
}
export function BlockchainPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const detailTrigger = useRef<HTMLButtonElement>(null);
  const [cursor, setCursor] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Proof | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const connection = useQuery({
    queryKey: ["blockchain-connection"],
    queryFn: () =>
      apiRequest<{
        enabled: boolean;
        chain_id: number;
        contract_address: string;
        network: string;
        scope: string;
      }>("/blockchain-records/connection/"),
  });
  const query = useQuery({
    queryKey: ["blockchain", cursor, ordering, filters, search],
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiRequest<ProofPage>(
        `/blockchain-records/?${new URLSearchParams({ ...filters, cursor, ordering, search })}`,
      ),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      apiRequest<Proof>(`/blockchain-records/${id}/retry/`, { method: "POST" }),
    onSuccess: async (proof) => {
      setSelected(proof);
      await cache.invalidateQueries({ queryKey: ["blockchain"] });
    },
  });
  function navigate(url: string | null) {
    if (url)
      setCursor(
        new URL(url, window.location.origin).searchParams.get("cursor") ?? "",
      );
  }
  return (
    <Page title="Blockchain Verification">
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <form
          className="flex min-w-0 basis-full items-end gap-2 sm:basis-auto sm:grow"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(
              String(new FormData(e.currentTarget).get("search") ?? "").trim(),
            );
            setCursor("");
          }}
        >
          <div className="min-w-0 grow">
            <Field label="Transaction Hash / SHA-256">
              <input
                name="search"
                type="search"
                placeholder="Full hash"
                maxLength={66}
              />
            </Field>
          </div>
          <Button variant="outline" type="submit">
            Search
          </Button>
        </form>
        <FilterDialog
          value={filters}
          onApply={(value) => {
            setFilters(value);
            setCursor("");
          }}
        >
          {(draft, change) => (
            <>
              <Field label="Status">
                <select
                  value={draft.status ?? ""}
                  onChange={(e) => change({ ...draft, status: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  {["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"].map((s) => (
                    <option key={s} value={s}>
                      {readable(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Event">
                <select
                  value={draft.record_type ?? ""}
                  onChange={(e) =>
                    change({ ...draft, record_type: e.target.value })
                  }
                >
                  <option value="">All Events</option>
                  {[
                    "DOCUMENT_VERIFIED",
                    "PRE_ENROLLMENT_CONFIRMED",
                    "REGISTRATION_RECORDED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {readable(s)}
                    </option>
                  ))}
                </select>
              </Field>
              {[
                ["from", "From Date"],
                ["to", "To Date"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="date"
                    value={draft[key] ?? ""}
                    onChange={(e) =>
                      change({ ...draft, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </>
          )}
        </FilterDialog>
        {user?.role !== "LEARNER" && (
          <Button variant="ghost" onClick={() => setNetworkOpen(true)}>
            Network Details
          </Button>
        )}
      </div>
      <ErrorMessage error={query.error || connection.error} />
      {query.isPending && (
        <LoadingState label="Loading verification records…" />
      )}
      {query.data && (
        <section aria-label="Verification Results" aria-busy={query.isFetching}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted" role="status">
              {query.data.results.length} Records on This Page
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching || !query.data.previous}
                onClick={() => navigate(query.data.previous)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching || !query.data.next}
                onClick={() => navigate(query.data.next)}
              >
                Next
              </Button>
            </div>
          </div>
          {query.data.results.length === 0 ? (
            <p className="panel">
              No verification records match these filters.
            </p>
          ) : (
            <div
              className="table-frame result-table"
              role="region"
              tabIndex={0}
              aria-label="Blockchain Records"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <SortableHeader
                      label="Recorded"
                      className="hidden sm:table-cell"
                      column="created_at"
                      ordering={ordering}
                      onSort={(value) => {
                        setOrdering(value);
                        setCursor("");
                      }}
                    />
                    <th scope="col">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.results.map((proof) => (
                    <tr key={proof.id}>
                      <td className="font-medium">
                        {readable(proof.record_type)}
                      </td>
                      <td>
                        <span className="badge">{readable(proof.status)}</span>
                      </td>
                      <td className="hidden whitespace-nowrap text-xs text-muted sm:table-cell">
                        <time dateTime={proof.created_at}>
                          {new Date(proof.created_at).toLocaleString()}
                        </time>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${readable(proof.record_type)} details`}
                          onClick={(event) => {
                            detailTrigger.current = event.currentTarget;
                            setSelected(proof);
                            retry.reset();
                          }}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailTrigger.current?.focus();
          }}
        >
          <DialogTitle>Verification Details</DialogTitle>
          <DialogDescription>
            {selected ? readable(selected.record_type) : ""}
          </DialogDescription>
          {selected && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3">
                <span className="text-sm font-medium">Transaction Status</span>
                <span className="badge">{readable(selected.status)}</span>
              </div>
              <dl className="space-y-4 text-sm">
                {[
                  ["SHA-256", selected.record_hash],
                  [
                    "Transaction",
                    selected.transaction_hash || "Not submitted to chain",
                  ],
                  ["Reference", selected.opaque_reference],
                  [
                    "Block / Confirmations",
                    `${selected.block_number ?? "—"} / ${selected.confirmations}`,
                  ],
                  ["Recorded", new Date(selected.created_at).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-semibold text-muted">{label}</dt>
                    <dd className="mt-1 break-all font-mono text-xs">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {selected.error_message && (
                <p role="status" className="text-sm">
                  {user?.role === "LEARNER"
                    ? "Verification is delayed. The school can retry it."
                    : selected.error_message}
                </p>
              )}
              <ErrorMessage error={retry.error} />
              {user?.role !== "LEARNER" && selected.status !== "CONFIRMED" && (
                <Button
                  variant="outline"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(selected.id)}
                >
                  Retry Verification
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={networkOpen} onOpenChange={setNetworkOpen}>
        <DialogContent>
          <DialogTitle>Network Details</DialogTitle>
          <DialogDescription className="sr-only">
            Configured blockchain network
          </DialogDescription>
          {connection.data && (
            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Network</dt>
                <dd>
                  {connection.data.network} · Chain {connection.data.chain_id}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Contract</dt>
                <dd className="break-all font-mono text-xs">
                  {connection.data.contract_address || "Not configured"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Scope</dt>
                <dd>{connection.data.scope}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
