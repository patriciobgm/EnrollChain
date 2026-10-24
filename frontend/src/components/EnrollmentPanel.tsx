import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, jsonBody } from "../lib/api";
import {
  readable,
  type Enrollment,
  type Section,
  type Program,
} from "../lib/admissions";
import { useAuth } from "../lib/auth";
import { ErrorMessage, Field } from "./Form";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/Dialog";
import { Button } from "./ui/Button";
import { LoadingState } from "./ui/LoadingState";

export function EnrollmentPanel({ id }: { id: string }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const [reference, setReference] = useState("");
  const [section, setSection] = useState("");
  const [program, setProgram] = useState("");
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
  });
  const query = useQuery({
    queryKey: ["enrollment", id],
    queryFn: () => apiRequest<Enrollment>(`/enrollments/${id}/`),
  });
  const staff = ["REGISTRAR", "ADMINISTRATOR"].includes(user?.role ?? "");
  const sections = useQuery({
    queryKey: ["sections"],
    enabled: staff,
    queryFn: () => apiRequest<Section[]>("/sections/"),
  });
  const update = useMutation({
    mutationFn: (action: string) =>
      apiRequest<Enrollment>(
        `/enrollments/${id}/transition/`,
        jsonBody({
          action,
          remarks,
          reference,
          ...(section ? { section: Number(section) } : {}),
          ...(program ? { program: Number(program) } : {}),
        }),
      ),
    onMutate: () => ({ submittedRemarks: remarks }),
    onSuccess: async (_data, _action, context) => {
      setRemarks((current) =>
        current === context?.submittedRemarks ? "" : current,
      );
      await cache.invalidateQueries();
    },
  });
  const app = query.data;
  if (query.isPending)
    return <LoadingState label="Loading enrollment progress…" />;
  if (!app) return <ErrorMessage error={query.error} />;
  const stage = app.enrollment_status;
  const lis = app.lis_record?.status ?? "NOT_READY";
  const evaluating = [
    "SUBMITTED",
    "FOR_DOCUMENT_VERIFICATION",
    "FOR_EVALUATION",
    "FOR_RESUBMISSION",
    "NOT_QUALIFIED",
  ].includes(stage);
  const assigning =
    ["PRE_ENROLLED", "SECTION_ASSIGNED", "FOR_LIS_REGISTRATION"].includes(
      stage,
    ) && !["SUBMITTED_TO_LIS", "LIS_CONFIRMED"].includes(lis);
  const buttons: [string, string, boolean][] = [];
  if (
    user?.role === "GUIDANCE_OFFICER" &&
    evaluating &&
    !app.guidance_completed
  )
    buttons.push(["interview", "Record Completed Interview", true]);
  if (user?.role === "REGISTRAR") {
    if (!app.program && evaluating)
      buttons.push([
        "complete_program",
        "Complete missing program",
        !!program && !!remarks.trim(),
      ]);
    if (evaluating)
      buttons.push(
        ["qualify", "Mark qualified", app.eligibility.ready],
        ["not_qualified", "Mark not qualified", !!remarks.trim()],
        ["reject", "Reject application", !!remarks.trim()],
      );
    if (stage === "QUALIFIED")
      buttons.push([
        "pre_enroll",
        "Confirm pre-enrollment & assign section",
        app.eligibility.ready,
      ]);
    if (["QUALIFIED", "NOT_QUALIFIED", "REJECTED"].includes(stage))
      buttons.push(["reopen", "Reopen evaluation", !!remarks.trim()]);
  }
  if (staff && assigning) {
    buttons.push(
      ["auto_assign", "Find available section", true],
      [
        "assign",
        "Assign / transfer to selected section",
        !!section && !!remarks.trim(),
      ],
    );
    if (app.section_assignment)
      buttons.push([
        "remove_section",
        "Remove section assignment",
        !!remarks.trim(),
      ]);
  }
  if (staff && app.section_assignment) {
    if (["NOT_READY", "LIS_REJECTED"].includes(lis))
      buttons.push(["lis_prepare", "Mark ready for LIS", true]);
    if (lis === "READY_FOR_LIS")
      buttons.push(["lis_submit", "Record submission to LIS", true]);
    if (lis === "SUBMITTED_TO_LIS")
      buttons.push(
        [
          "lis_confirm",
          "Confirm LIS registration & official enrollment",
          !!remarks.trim(),
        ],
        ["lis_reject", "Record LIS rejection", !!remarks.trim()],
      );
  }
  return (
    <section className="panel mb-6 space-y-5" aria-label="Enrollment progress">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Early enrollment progress</h2>
        <span className="badge">{readable(stage)}</span>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">Guidance interview</dt>
          <dd>{app.guidance_completed ? "Completed" : "Awaiting interview"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Preliminary section</dt>
          <dd>
            {app.section_assignment?.section_name ??
              (stage === "PRE_ENROLLED"
                ? "Waiting for an available section"
                : "Not assigned")}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">LIS processing</dt>
          <dd>{readable(lis)}</dd>
        </div>
      </dl>
      {app.eligibility.profile_missing.length > 0 && (
        <p className="text-sm">
          Complete profile:{" "}
          {app.eligibility.profile_missing.map(readable).join(", ")}.{" "}
          {user?.role === "LEARNER" && (
            <Link className="text-brand underline" to="/learners">
              Update my profile
            </Link>
          )}
        </p>
      )}
      {!app.eligibility.track_and_program_valid && (
        <p role="status">
          An active track and matching program must be selected. Contact the
          Registrar to complete a legacy application with no program.
        </p>
      )}
      {app.eligibility.pending_requirements.length > 0 && (
        <p className="text-sm">
          Awaiting Registrar verification:{" "}
          {app.eligibility.pending_requirements.join(", ")}.
        </p>
      )}
      {buttons.length > 0 && (
        <div className="space-y-4 border-t border-line pt-4">
          <h3 className="font-bold">
            {user?.role === "GUIDANCE_OFFICER"
              ? "Guidance interview"
              : "School processing"}
          </h3>
          <Field
            label={
              user?.role === "GUIDANCE_OFFICER"
                ? "Private interview notes"
                : "Remarks / reason / LIS confirmation evidence"
            }
          >
            <textarea
              disabled={update.isPending}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </Field>
          {user?.role === "REGISTRAR" && !app.program && (
            <Field label="Missing legacy program">
              <select
                disabled={update.isPending}
                value={program}
                onChange={(e) => setProgram(e.target.value)}
              >
                <option value="">Choose matching program</option>
                {programs.data
                  ?.filter((p) => p.is_active && p.track === app.track)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {staff && assigning && (
            <Field label="Eligible section">
              <select
                disabled={update.isPending}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="">Choose a section for manual assignment</option>
                {sections.data
                  ?.filter(
                    (s) =>
                      s.active &&
                      s.track === app.track &&
                      s.program === app.program &&
                      s.grade_level === app.grade_level &&
                      s.school_year === app.school_year,
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.available_slots} available
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {staff && app.section_assignment && (
            <Field label="LIS reference (if available)">
              <input
                disabled={update.isPending}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={100}
              />
            </Field>
          )}
          <ErrorMessage error={update.error || sections.error} />
          <div className="flex flex-wrap gap-3">
            {buttons.map(([action, label, enabled]) => (
              <button
                key={action}
                className="action secondary"
                disabled={update.isPending || !enabled}
                onClick={() => update.mutate(action)}
              >
                {update.isPending && update.variables === action
                  ? "Saving…"
                  : label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">
            Enrollment History ({app.enrollment_events.length})
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Enrollment History</DialogTitle>
          <DialogDescription>
            {app.enrollment_events.length} recorded events
          </DialogDescription>
          <ol className="mt-6 space-y-5">
            {app.enrollment_events.map((e) => (
              <li
                key={e.id}
                className="relative border-l-2 border-brand/25 pl-5 text-sm before:absolute before:-left-[5px] before:top-1 before:size-2 before:rounded-full before:bg-brand"
              >
                <strong>{readable(e.action)}</strong>
                <p className="text-muted">
                  {new Date(e.created_at).toLocaleString()} ·{" "}
                  {readable(e.actor_role ?? "System")}
                </p>
                {e.remarks && (
                  <p className="whitespace-pre-wrap">{e.remarks}</p>
                )}
              </li>
            ))}
          </ol>
          {app.enrollment_events.length === 0 && (
            <p className="mt-3 text-sm">No workflow events yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
