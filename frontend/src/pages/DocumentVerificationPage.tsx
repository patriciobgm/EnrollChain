import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ErrorMessage, Page } from "../components/Form";
import { IntegrityCheck } from "../components/IntegrityCheck";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest, apiResponse } from "../lib/api";
import { readable, type Document } from "../lib/admissions";

export function DocumentVerificationPage() {
  const { id } = useParams<{ id: string }>();
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const document = useQuery({
    queryKey: ["verification-document", id],
    queryFn: () => apiRequest<Document>(`/documents/${id}/`),
    enabled: !!id,
    retry: false,
  });
  useEffect(
    () => () => {
      if (qr) URL.revokeObjectURL(qr);
    },
    [qr],
  );
  async function createQr() {
    setBusy(true);
    setError("");
    try {
      const response = await apiResponse(
        `/documents/${id}/verification-qr/?origin=${encodeURIComponent(window.location.origin)}`,
      );
      setQr(URL.createObjectURL(await response.blob()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create QR code.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Document Verification">
      <ErrorMessage error={document.error || error} />
      {document.isPending && <LoadingState label="Loading document record…" />}
      {document.data && id && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold">
              {document.data.requirement_name}
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted">Application</dt>
                <dd>{document.data.application_reference}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Registrar Review</dt>
                <dd>{readable(document.data.review_status)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Version</dt>
                <dd>
                  {document.data.version}
                  {document.data.is_latest
                    ? " · Latest"
                    : " · Previous Submission"}
                </dd>
              </div>
            </dl>
            <IntegrityCheck id={id} standalone />
            <Link
              className="action secondary"
              to={`/applications/${document.data.application}`}
            >
              View Application
            </Link>
          </section>
          <section className="panel space-y-4">
            <h2 className="text-lg font-bold">Verification QR</h2>
            <p className="text-sm text-muted">
              Sign-in and document access are required. No personal details are
              included in the QR code.
            </p>
            {!qr && (
              <button
                className="action secondary"
                disabled={busy}
                onClick={() => void createQr()}
              >
                {busy ? "Generating…" : "Show QR Code"}
              </button>
            )}
            {qr && (
              <>
                <img
                  src={qr}
                  width={256}
                  height={256}
                  className="max-w-full bg-white"
                  alt="QR code linking to this authorized document verification page"
                />
                <a
                  className="action secondary"
                  href={qr}
                  download="document-verification.svg"
                >
                  Download QR
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
