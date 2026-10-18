import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorMessage, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { readable, type Paginated } from "../lib/admissions";
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
export function BlockchainPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
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
    queryKey: ["blockchain", page],
    queryFn: () =>
      apiRequest<Paginated<Proof>>(`/blockchain-records/?page=${page}`),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/blockchain-records/${id}/retry/`, { method: "POST" }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["blockchain"] });
    },
  });
  return (
    <Page title="Blockchain Verification">
      <p className="mb-5 text-muted">
        Checks whether verified files have changed.
      </p>
      {user?.role !== "LEARNER" && connection.data && (
        <details className="mb-5 rounded-xl border border-line p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Network details
          </summary>
          <p className="mt-3">
            {connection.data.network} · Chain {connection.data.chain_id}
          </p>
          <p className="break-all">
            {connection.data.contract_address || "Not configured"}
          </p>
        </details>
      )}
      <ErrorMessage error={query.error || connection.error || retry.error} />
      {query.isPending && (
        <LoadingState label="Loading verification records…" />
      )}
      {query.data?.count === 0 && (
        <p className="panel">No blockchain verification records yet.</p>
      )}
      <div className="space-y-4">
        {query.data?.results.map((p) => (
          <article className="panel space-y-3" key={p.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{readable(p.record_type)}</h2>
              <span className="badge">{readable(p.status)}</span>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">
                Technical details
              </summary>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-muted">SHA-256</dt>
                  <dd className="break-all font-mono">{p.record_hash}</dd>
                </div>
                <div>
                  <dt className="text-muted">Transaction</dt>
                  <dd className="break-all font-mono">
                    {p.transaction_hash || "Not submitted to chain"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Block / confirmations</dt>
                  <dd>
                    {p.block_number ?? "—"} / {p.confirmations}
                  </dd>
                </div>
              </dl>
            </details>
            {p.error_message && (
              <p role="status" className="text-sm">
                {user?.role === "LEARNER"
                  ? "Verification is delayed. The school can retry it."
                  : p.error_message}
              </p>
            )}
            {user?.role !== "LEARNER" && p.status !== "CONFIRMED" && (
              <button
                className="action secondary"
                disabled={retry.isPending}
                onClick={() => retry.mutate(p.id)}
              >
                Retry verification
              </button>
            )}
          </article>
        ))}
      </div>
      {query.data && query.data.count > 20 && (
        <div className="mt-5 flex items-center gap-3">
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
