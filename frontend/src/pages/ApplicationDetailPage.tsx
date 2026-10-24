import { BackLink } from "../components/BackNavigation";
import { IntegrityCheck } from "../components/IntegrityCheck";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { apiRequest, jsonBody } from "../lib/api";
import { readable } from "../lib/admissions";
import type {
  Application,
  Document,
  Program,
  Requirement,
  TrackConfiguration,
} from "../lib/admissions";
import { PdfPreviewDialog } from "../components/PdfPreview";
import { downloadDocument } from "../lib/download";
import { ReviewStatusBadge } from "../components/ReviewStatusBadge";
import { LoadingState } from "../components/ui/LoadingState";
import { can, useAuth } from "../lib/auth";

function UploadForm({
  application,
  requirement,
  onUploaded,
}: {
  application: string;
  requirement: Requirement;
  onUploaded: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = (form.elements.namedItem("file") as HTMLInputElement)
      .files?.[0];
    if (
      !file?.size ||
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.type !== "application/pdf"
    ) {
      setError("Select a PDF file.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("PDF must be at most 30 MB.");
      return;
    }
    data.set("file", file);
    data.set("application", application);
    data.set("requirement", String(requirement.id));
    setBusy(true);
    setError("");
    try {
      await apiRequest("/documents/", { method: "POST", body: data });
      await onUploaded();
      form.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={upload} className="mt-4 space-y-3">
      <ErrorMessage error={error} />
      <Field
        label={`PDF for ${requirement.name}`}
        hint="PDF only · Up to 30 MB · Previous versions are retained"
      >
        <input
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          disabled={busy}
        />
      </Field>
      <button className="action secondary" disabled={busy}>
        {busy
          ? "Uploading…"
          : requirement.uploaded
            ? "Upload new version"
            : "Upload PDF"}
      </button>
    </form>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTrack, setEditTrack] = useState("ACADEMIC");
  const application = useQuery({
    queryKey: ["application", id],
    queryFn: () => apiRequest<Application>(`/applications/${id}/`),
  });
  const requirements = useQuery({
    queryKey: ["requirements", id],
    queryFn: () =>
      apiRequest<Requirement[]>(`/applications/${id}/requirements/`),
  });
  const documents = useQuery({
    queryKey: ["documents", id],
    queryFn: () => apiRequest<Document[]>(`/documents/?application=${id}`),
    enabled: can(user, "view_documentsubmission"),
  });
  const tracks = useQuery({
    queryKey: ["tracks"],
    queryFn: () => apiRequest<TrackConfiguration[]>("/tracks/"),
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
    enabled: editing,
  });
  async function reload() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["application", id] }),
      cache.invalidateQueries({ queryKey: ["requirements", id] }),
      cache.invalidateQueries({ queryKey: ["documents", id] }),
      cache.invalidateQueries({ queryKey: ["applications"] }),
      cache.invalidateQueries({ queryKey: ["enrollment", id] }),
    ]);
  }
  const submit = useMutation({
    mutationFn: () =>
      apiRequest(`/applications/${id}/submit/`, { method: "POST" }),
    onSuccess: reload,
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest(`/applications/${id}/`, jsonBody(data, "PATCH")),
    onSuccess: async () => {
      await reload();
      setEditing(false);
    },
  });
  function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save.mutate({
      ...data,
      grade_level: Number(data.grade_level),
      program: data.program ? Number(data.program) : null,
    });
  }
  async function download(document: Document) {
    setDownloadError("");
    setDownloading(document.id);
    try {
      await downloadDocument(document.id, document.original_filename);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(null);
    }
  }
  const app = application.data;
  return (
    <Page title="Application details">
      <BackLink to="/applications" className="mb-5">
        Back to Applications
      </BackLink>
      <ErrorMessage
        error={application.error || requirements.error || documents.error}
      />
      {application.isPending && (
        <LoadingState label="Loading application…" rows={2} />
      )}
      {app && (
        <>
          <section className="panel mb-6 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{app.learner_name}</h2>
            </div>
            <p className="break-all text-sm text-muted">{app.reference}</p>
            <p>
              {app.period_name}
              {app.program_name && ` · ${app.program_name}`}
            </p>
            <p>
              Grade {app.grade_level} · {app.track.replaceAll("_", " ")} ·{" "}
              {readable(app.classification)} · {app.source.replaceAll("_", " ")}
            </p>
            <p className="text-sm">
              Created: {new Date(app.created_at).toLocaleString()}
              {app.submitted_at &&
                ` · Submitted: ${new Date(app.submitted_at).toLocaleString()}`}
            </p>
            {app.status === "DRAFT" && can(user, "change_application") && (
              <button
                className="action secondary"
                onClick={() => {
                  setEditing(!editing);
                  setEditTrack(app.track);
                }}
              >
                Edit draft choices
              </button>
            )}
            {app.status === "SUBMITTED" && (
              <p role="status">
                Upload missing requirements below. Rejected files and correction
                requests can be resubmitted.
              </p>
            )}
          </section>
          <EnrollmentPanel id={app.id} />
          {editing && app.status === "DRAFT" && (
            <form onSubmit={edit} className="panel mb-6 space-y-4">
              <h2 className="font-bold">Draft choices</h2>
              <ErrorMessage error={save.error || programs.error} />
              <p className="text-sm">
                Choices are locked after the first document upload to preserve
                its requirement assignment.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Grade level">
                  <select name="grade_level" defaultValue={app.grade_level}>
                    <option value="11">Grade 11</option>
                    <option value="12">Grade 12</option>
                  </select>
                </Field>
                <Field label="Track">
                  <select
                    name="track"
                    value={editTrack}
                    onChange={(e) => setEditTrack(e.target.value)}
                  >
                    {tracks.data
                      ?.filter((t) => t.active)
                      .map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Cluster / strand / specialization">
                  <select
                    key={`${editTrack}-${programs.isSuccess}`}
                    name="program"
                    defaultValue={
                      editTrack === app.track ? (app.program ?? "") : ""
                    }
                  >
                    <option value="">No program selected</option>
                    {programs.data
                      ?.filter((p) => p.is_active && p.track === editTrack)
                      .map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Learner classification">
                  <select
                    name="classification"
                    defaultValue={readable(app.classification)}
                  >
                    <option value="NEW">New</option>
                    <option value="TRANSFEREE">Transferee</option>
                    <option value="RETURNING">Balik-Aral</option>
                  </select>
                </Field>
              </div>
              <button
                className="action"
                disabled={
                  save.isPending || programs.isPending || programs.isError
                }
              >
                Save changes
              </button>
            </form>
          )}
          {app.status === "DRAFT" && can(user, "submit_application") && (
            <section className="panel my-6 space-y-4">
              <h2 className="font-bold">Submit application</h2>
              <p>
                Submit your early enrollment, then upload the required PDFs
                below. Submission is not an admission decision or official LIS
                enrollment.
              </p>
              <ErrorMessage error={submit.error} />
              <button
                className="action"
                disabled={
                  submit.isPending ||
                  requirements.isPending ||
                  requirements.isError
                }
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? "Submitting…" : "Submit application"}
              </button>
            </section>
          )}
          <h2 className="mb-4 text-xl font-bold">Requirements checklist</h2>
          {requirements.isPending && (
            <LoadingState label="Loading requirements…" rows={2} />
          )}
          {requirements.data?.length === 0 && (
            <p className="panel mb-6">
              No documents are configured for this learner’s application.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {requirements.data?.map((req) => (
              <section className="panel" key={req.id}>
                <h3 className="font-bold">{req.name}</h3>
                <div className="my-2">
                  <ReviewStatusBadge
                    status={
                      req.review_status ??
                      (req.uploaded ? "PENDING" : "NOT_UPLOADED")
                    }
                  />
                </div>
                <p className="mt-1 text-sm">
                  {req.is_required ? "Required" : "Optional"} ·{" "}
                  {req.uploaded ? "Uploaded" : "Not uploaded"}
                </p>
                {(app.status === "DRAFT" || req.can_upload) &&
                  can(user, "add_documentsubmission") && (
                    <UploadForm
                      application={app.id}
                      requirement={req}
                      onUploaded={reload}
                    />
                  )}
              </section>
            ))}
          </div>
          {can(user, "view_documentsubmission") && (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-bold">
                Document submission history
              </h2>
              <ErrorMessage error={downloadError} />
              {documents.isPending && (
                <LoadingState label="Loading document history…" rows={2} />
              )}
              {documents.data?.length === 0 && (
                <p className="panel">No documents uploaded yet.</p>
              )}
              <div className="space-y-3">
                {documents.data?.map((doc) => (
                  <article key={doc.id} className="panel space-y-4">
                    <div className="min-w-0">
                      <h3 className="break-all font-semibold">
                        {doc.requirement_name}
                      </h3>
                      <p className="mt-1 break-all text-sm text-muted">
                        {doc.original_filename}
                      </p>
                      <div className="my-2 flex flex-wrap items-center gap-2">
                        <ReviewStatusBadge
                          status={doc.review_status ?? "PENDING"}
                        />
                        {doc.is_latest === false && (
                          <span className="text-xs text-muted">
                            Earlier version
                          </span>
                        )}
                      </div>
                      {doc.review && (
                        <div className="my-3 rounded-xl border border-line bg-canvas p-3">
                          <p className="text-xs text-muted">
                            {doc.review.reviewer_name} ·{" "}
                            {new Date(doc.review.reviewed_at).toLocaleString()}
                          </p>
                          {doc.review.remarks && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                              {doc.review.remarks}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-muted">
                        Version {doc.version} ·{" "}
                        {(doc.file_size / 1024).toFixed(1)} KB ·{" "}
                        {new Date(doc.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                      <PdfPreviewDialog
                        id={doc.id}
                        filename={doc.original_filename}
                      />
                      <button
                        className="action secondary"
                        disabled={downloading !== null}
                        onClick={() => void download(doc)}
                      >
                        {downloading === doc.id
                          ? "Downloading…"
                          : "Download PDF"}
                      </button>
                    </div>
                    <IntegrityCheck id={doc.id} />
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
