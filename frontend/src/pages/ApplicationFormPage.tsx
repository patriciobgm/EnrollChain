import { LoadingState } from "../components/ui/LoadingState";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { apiRequest, jsonBody } from "../lib/api";
import type { Application, Learner, Period, Program } from "../lib/admissions";
import { useAuth } from "../lib/auth";

export function ApplicationFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [track, setTrack] = useState("ACADEMIC");
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: () => apiRequest<Period[]>("/admission-periods/"),
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
  });
  const learners = useQuery({
    queryKey: ["learners"],
    queryFn: () => apiRequest<Learner[]>("/learners/"),
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest<Application>("/applications/", jsonBody(data)),
    onSuccess: (app) => navigate(`/applications/${app.id}`),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save.mutate({
      ...data,
      admission_period: Number(data.admission_period),
      grade_level: Number(data.grade_level),
      program: data.program ? Number(data.program) : null,
    });
  }
  const pending = periods.isPending || programs.isPending || learners.isPending;
  const error = periods.error || programs.error || learners.error;
  return (
    <Page title="Start an application">
      <ErrorMessage error={error} />
      {pending && <LoadingState label="Loading application choices…" />}
      {!pending && !error && (
        <form onSubmit={submit} className="panel space-y-5">
          <ErrorMessage error={save.error} />
          {learners.data?.length === 0 && (
            <p>
              No learner profiles found.{" "}
              <Link className="text-brand underline" to="/learners">
                Add a learner profile
              </Link>{" "}
              first.
            </p>
          )}
          {!periods.data?.some((p) => p.is_active) && (
            <p role="status">
              No active admission periods. Please contact the school.
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Learner">
              <select name="learner" required defaultValue="">
                <option value="" disabled>
                  Select learner
                </option>
                {learners.data?.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.first_name} {l.last_name} · {l.lrn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Admission period">
              <select name="admission_period" required defaultValue="">
                <option value="" disabled>
                  Select admission period
                </option>
                {periods.data
                  ?.filter((p) => p.is_active)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} ({p.opens_on} to {p.closes_on})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Grade level">
              <select name="grade_level">
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
              </select>
            </Field>
            <Field label="Track">
              <select
                name="track"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              >
                <option value="ACADEMIC">Academic</option>
                <option value="TECHNICAL_PROFESSIONAL">
                  Technical Professional
                </option>
              </select>
            </Field>
            <Field label="Program / specialization (optional)">
              <select key={track} name="program" defaultValue="">
                <option value="">No program selected</option>
                {programs.data
                  ?.filter((p) => p.track === track && p.is_active)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Learner classification">
              <select name="classification">
                <option value="NEW">New</option>
                <option value="TRANSFEREE">Transferee</option>
                <option value="RETURNING">Returning</option>
              </select>
            </Field>
            <Field label="Application source">
              <select
                name="source"
                defaultValue={user?.role === "REGISTRAR" ? "WALK_IN" : "ONLINE"}
              >
                <option value="ONLINE">Online</option>
                {["REGISTRAR", "ADMINISTRATOR"].includes(user?.role ?? "") && (
                  <option value="WALK_IN">Walk-in</option>
                )}
              </select>
            </Field>
          </div>
          <p className="text-sm text-muted">
            One application per learner per admission period. You can upload
            documents after saving the draft.
          </p>
          <button
            className="action"
            disabled={
              save.isPending ||
              !learners.data?.length ||
              !periods.data?.some((p) => p.is_active)
            }
          >
            {save.isPending ? "Saving…" : "Save draft"}
          </button>
        </form>
      )}
    </Page>
  );
}
