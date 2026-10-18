import { ArrowLeft } from "lucide-react";
import { LoadingState } from "../components/ui/LoadingState";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { apiRequest, jsonBody } from "../lib/api";
import type {
  Application,
  Paginated,
  Enrollment,
  Learner,
  Period,
  Program,
  TrackConfiguration,
} from "../lib/admissions";
import { useAuth } from "../lib/auth";

export function ApplicationFormPage() {
  const { user } = useAuth();
  const unfinished = useQuery({
    queryKey: ["unfinished-enrollment", user?.id],
    enabled: user?.role === "LEARNER",
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>("/enrollments/?pending=true"),
  });
  const selfService = user?.role === "LEARNER";
  const navigate = useNavigate();
  const [learnerSearch, setLearnerSearch] = useState("");
  const [track, setTrack] = useState("");
  const tracks = useQuery({
    queryKey: ["tracks"],
    queryFn: () => apiRequest<TrackConfiguration[]>("/tracks/"),
  });
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: () => apiRequest<Period[]>("/admission-periods/"),
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
  });
  const learners = useQuery({
    queryKey: ["application-learner-choices", user?.id, learnerSearch],
    queryFn: async () =>
      user?.role === "LEARNER"
        ? apiRequest<Learner[]>("/learners/")
        : (
            await apiRequest<Paginated<Learner>>(
              `/learners/?page=1&search=${encodeURIComponent(learnerSearch)}`,
            )
          ).results,
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest<Application>("/applications/", jsonBody(data)),
    onSuccess: (app) => navigate(`/applications/${app.id}`),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (selfService && learners.data?.length !== 1) return;
    save.mutate({
      ...data,
      ...(selfService ? { learner: learners.data![0].id } : {}),
      admission_period: Number(data.admission_period),
      grade_level: Number(data.grade_level),
      program: data.program ? Number(data.program) : null,
    });
  }
  const pending =
    periods.isPending ||
    programs.isPending ||
    learners.isPending ||
    tracks.isPending;
  const error =
    periods.error || programs.error || learners.error || tracks.error;
  if (user?.role === "LEARNER") {
    if (unfinished.isPending)
      return (
        <Page title="My Enrollment">
          <LoadingState label="Loading enrollment…" />
        </Page>
      );
    if (unfinished.error)
      return (
        <Page title="My Enrollment">
          <ErrorMessage error={unfinished.error} />
        </Page>
      );
    if (unfinished.data?.count)
      return (
        <Page title="My Enrollment">
          <Link
            className="action"
            to={`/applications/${unfinished.data.results[0].id}`}
          >
            Continue application
          </Link>
        </Page>
      );
  }
  return (
    <Page title="New Application">
      <Link to="/applications" className="action secondary mb-6 gap-2">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Early Enrollment
      </Link>
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
          {user?.role !== "LEARNER" && (
            <Field label="Find learner by name or LRN">
              <input
                type="search"
                value={learnerSearch}
                onChange={(e) => setLearnerSearch(e.target.value)}
              />
            </Field>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            {selfService ? (
              <div>
                <p className="text-sm font-semibold">Learner</p>
                <p className="mt-2 font-medium">
                  {learners.data?.length === 1
                    ? `${learners.data[0].first_name} ${learners.data[0].last_name}`
                    : "Profile unavailable"}
                </p>
                {learners.data?.length === 1 && (
                  <p className="text-sm text-muted">
                    LRN: {learners.data[0].lrn || "Not provided"}
                  </p>
                )}
                {(learners.data?.length ?? 0) > 1 && (
                  <p role="alert">
                    Your account has conflicting profiles. Contact the
                    Registrar.
                  </p>
                )}
              </div>
            ) : (
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
            )}
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
                required
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              >
                <option value="">Select track</option>
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
              <select key={track} name="program" required defaultValue="">
                <option value="">Select program</option>
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
                <option value="RETURNING">Balik-Aral</option>
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
          <button
            className="action"
            disabled={
              save.isPending ||
              (selfService && learners.data?.length !== 1) ||
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
