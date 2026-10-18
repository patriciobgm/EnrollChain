import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";
import { SortableHeader } from "../components/SortableHeader";
import { Pagination } from "../components/Pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EnrollmentFilters } from "../components/EnrollmentFilters";
import { ErrorMessage, Field, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest, jsonBody } from "../lib/api";
import {
  readable,
  type Enrollment,
  type Paginated,
  type Section,
  type Program,
  type TrackConfiguration,
} from "../lib/admissions";
import { useAuth } from "../lib/auth";
export function SectionsPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("name");
  const [rosterPage, setRosterPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Section | null | undefined>(undefined);
  const [track, setTrack] = useState("");
  const query = useQuery({
    queryKey: ["sections", filters, page],
    queryFn: () =>
      apiRequest<Paginated<Section>>(
        `/sections/?${new URLSearchParams({ ...filters, page: String(page) })}`,
      ),
  });
  const roster = useQuery({
    queryKey: ["roster", selected, filters, rosterPage, ordering],
    enabled: selected !== null,
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>(
        `/sections/${selected}/roster/?${new URLSearchParams({ ...filters, page: String(rosterPage), ordering })}`,
      ),
  });
  const tracks = useQuery({
    queryKey: ["tracks"],
    queryFn: () => apiRequest<TrackConfiguration[]>("/tracks/"),
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
  });
  const years = useQuery({
    queryKey: ["school-years"],
    queryFn: () => apiRequest<{ id: number; name: string }[]>("/school-years/"),
  });
  const advisers = useQuery({
    queryKey: ["adviser-choices"],
    enabled: user?.role === "ADMINISTRATOR",
    queryFn: () =>
      apiRequest<{ count: number; results: { id: string; email: string }[] }>(
        "/accounts/users/?role=CLASS_ADVISER",
      ),
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest(
        editing ? `/sections/${editing.id}/` : "/sections/",
        jsonBody(data, editing ? "PATCH" : "POST"),
      ),
    onSuccess: async () => {
      setEditing(undefined);
      await cache.invalidateQueries();
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    save.mutate({
      ...data,
      school_year: Number(data.school_year),
      program: Number(data.program),
      grade_level: Number(data.grade_level),
      ...(data.capacity ? { capacity: Number(data.capacity) } : {}),
      adviser: data.adviser || null,
      active: data.active === "on",
    });
  }
  return (
    <Page
      title={
        user?.role === "CLASS_ADVISER" ? "My Sections" : "Section management"
      }
    >
      <EnrollmentFilters
        value={filters}
        onChange={(value) => {
          setFilters(value);
          setPage(1);
          setRosterPage(1);
        }}
      />
      {user?.role === "ADMINISTRATOR" && (
        <button
          className="action mb-5"
          onClick={() => {
            setEditing(null);
            setTrack("");
            save.reset();
          }}
        >
          Create section
        </button>
      )}
      <ErrorMessage error={query.error} />
      {query.isPending && <LoadingState label="Loading sections…" />}
      {query.data?.count === 0 && <p className="panel">No sections found.</p>}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(value) => {
          if (!value && !save.isPending) setEditing(undefined);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {editing ? "Edit Section" : "Create Section"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Section details and capacity
          </DialogDescription>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <ErrorMessage error={save.error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section code">
                <input name="code" required defaultValue={editing?.code} />
              </Field>
              <Field label="Section name">
                <input name="name" required defaultValue={editing?.name} />
              </Field>
              <Field label="School year">
                <select
                  name="school_year"
                  required
                  defaultValue={editing?.school_year ?? ""}
                >
                  <option value="">Choose year</option>
                  {years.data?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Grade">
                <select
                  name="grade_level"
                  defaultValue={editing?.grade_level ?? 11}
                >
                  <option value={11}>Grade 11</option>
                  <option value={12}>Grade 12</option>
                </select>
              </Field>
              <Field label="Track">
                <select
                  name="track"
                  required
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                >
                  <option value="">Choose track</option>
                  {tracks.data
                    ?.filter((t) => t.active)
                    .map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Cluster / strand">
                <select
                  key={track}
                  name="program"
                  required
                  defaultValue={editing?.program ?? ""}
                >
                  <option value="">Choose program</option>
                  {programs.data
                    ?.filter((p) => p.track === track && p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Capacity"
                hint="Leave empty to use the track default. Changes require a reason."
              >
                <input
                  type="number"
                  name="capacity"
                  min={1}
                  defaultValue={editing?.capacity}
                />
              </Field>
              <Field label="Class adviser">
                <select name="adviser" defaultValue={editing?.adviser ?? ""}>
                  <option value="">Not assigned</option>
                  {advisers.data?.results.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason for capacity override">
                <input name="reason" maxLength={2000} />
              </Field>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editing?.active ?? true}
                />
                Active
              </label>
            </div>
            <div className="flex gap-3">
              <button className="action" disabled={save.isPending}>
                Save section
              </button>
              <button
                type="button"
                className="action secondary"
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.results.map((s) => (
          <article key={s.id} className="panel space-y-3">
            <div className="flex justify-between gap-3">
              <h2 className="font-bold">{s.name}</h2>
              <span className="badge">{readable(s.status)}</span>
            </div>
            <p className="text-sm text-muted">
              #{s.id} · {s.code} · Grade {s.grade_level}
              <br />
              {s.track_name} · {s.program_name}
            </p>
            <p>
              {s.current_count} assigned / {s.capacity} capacity ·{" "}
              {s.available_slots} available
            </p>
            <progress
              className="h-2 w-full accent-brand"
              max={s.capacity}
              value={s.current_count}
              aria-label={`${s.name} utilization`}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className="action secondary"
                onClick={() => {
                  setSelected(s.id);
                  setRosterPage(1);
                }}
              >
                View roster
              </button>
              {user?.role === "ADMINISTRATOR" && (
                <button
                  className="action secondary"
                  onClick={() => {
                    setEditing(s);
                    setTrack(s.track);
                    save.reset();
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {query.data && (
        <Pagination
          count={query.data.count}
          page={page}
          onChange={setPage}
          busy={query.isFetching}
        />
      )}
      {selected !== null && (
        <section className="panel mt-6">
          <h2 className="mb-4 text-xl font-bold">
            {query.data?.results.find((s) => s.id === selected)?.name ??
              "Section"}{" "}
            roster
          </h2>
          <ErrorMessage error={roster.error} />
          {roster.isPending && <LoadingState label="Loading roster…" />}
          {roster.data?.count === 0 && <p>No learners match these filters.</p>}
          <div
            className="overflow-auto"
            tabIndex={0}
            role="region"
            aria-label="Section roster"
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    ["Learner / Reference", "name"],
                    ["Sex", "sex"],
                    ["Track / Program", "program"],
                    ["Enrollment", "stage"],
                    ["Requirements", ""],
                    ["LIS", "lis"],
                  ].map(([label, column]) =>
                    column ? (
                      <SortableHeader
                        key={label}
                        label={label}
                        column={column}
                        ordering={ordering}
                        onSort={(value) => {
                          setOrdering(value);
                          setRosterPage(1);
                        }}
                      />
                    ) : (
                      <th key={label} scope="col" className="p-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {roster.data?.results.map((a) => (
                  <tr key={a.id}>
                    <td className="border-t border-line p-3">
                      <Link
                        className="text-brand underline"
                        to={`/enrollments/${a.id}`}
                      >
                        {a.learner_name}
                      </Link>
                      <p className="text-xs">{a.learner_lrn || a.reference}</p>
                    </td>
                    <td>{a.learner_sex}</td>
                    <td>
                      {a.track_name}
                      <br />
                      {a.program_name}
                    </td>
                    <td>{readable(a.enrollment_status)}</td>
                    <td>
                      {a.eligibility.pending_requirements.length
                        ? `${a.eligibility.pending_requirements.length} pending`
                        : "Verified"}
                    </td>
                    <td>{readable(a.lis_record?.status ?? "NOT_READY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roster.data && (
            <Pagination
              count={roster.data.count}
              page={rosterPage}
              onChange={setRosterPage}
              busy={roster.isFetching}
            />
          )}
        </section>
      )}
    </Page>
  );
}
