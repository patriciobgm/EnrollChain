import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { ErrorMessage, Field } from "./Form";
interface Result {
  status: string;
  source: string;
  blockchain_status: string;
  current_hash?: string;
  expected_hash?: string;
}
export function IntegrityCheck({
  id,
  standalone = false,
}: {
  id: string;
  standalone?: boolean;
}) {
  const check = useMutation({
    mutationFn: (file: File | null) => {
      const body = new FormData();
      if (file) body.set("file", file);
      return apiRequest<Result>(
        `/documents/${id}/integrity/`,
        file ? { method: "POST", body } : undefined,
      );
    },
  });
  return (
    <details
      open={standalone || undefined}
      className="w-full border-t border-line pt-3"
    >
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        Check for file changes
      </summary>
      <p className="my-3 text-sm text-muted">
        Compare a PDF with its saved record. The Registrar checks the credential
        itself.
      </p>
      <button
        className="action secondary"
        disabled={check.isPending}
        onClick={() => check.mutate(null)}
      >
        Check stored PDF
      </button>
      <form
        className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file");
          if (file instanceof File && file.size > 0) check.mutate(file);
        }}
      >
        <Field label="PDF to compare">
          <input
            type="file"
            name="file"
            required
            accept="application/pdf,.pdf"
          />
        </Field>
        <button className="action secondary" disabled={check.isPending}>
          Compare PDF
        </button>
      </form>
      {!standalone && (
        <Link className="action secondary mt-3" to={`/verify-documents/${id}`}>
          Verification Link &amp; QR
        </Link>
      )}
      <ErrorMessage error={check.error} />
      {check.data && (
        <div role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm">
          <strong>
            {check.data.status === "UNCHANGED"
              ? "File matches the record"
              : check.data.status === "INTEGRITY_VERIFICATION_FAILED"
                ? "File does not match the record"
                : "Verification unavailable"}
          </strong>
          <p>
            {check.data.source === "BLOCKCHAIN"
              ? "Compared with blockchain record"
              : "Compared with saved upload"}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Technical details</summary>
            <p className="break-all">
              Current SHA-256: {check.data.current_hash || "—"}
            </p>
            <p className="break-all">
              Recorded SHA-256: {check.data.expected_hash || "—"}
            </p>
          </details>
        </div>
      )}
    </details>
  );
}
