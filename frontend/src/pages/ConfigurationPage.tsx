import { readable } from "../lib/admissions";
import { Pagination } from "../components/Pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPermission, isAdministrator } from "../lib/access";

type Resource =
  | "tracks"
  | "school-years"
  | "admission-periods"
  | "programs"
  | "requirements"
  | "requirement-rules";
type ConfigurationRecord = {
  id?: number;
  code?: string;
  name?: string;
  [key: string]: string | number | boolean | null | undefined;
};
interface ConfigField {
  name: string;
  label: string;
  type?: "date" | "boolean";
  options?: readonly string[];
  relation?: Resource;
  optional?: boolean;
}

const resources: Record<
  Resource,
  { label: string; model: string; fields: ConfigField[] }
> = {
  tracks: {
    label: "Tracks & capacities",
    model: "trackconfiguration",
    fields: [
      { name: "code", label: "Stable track code" },
      { name: "name", label: "Track name" },
      { name: "category", label: "Category", options: ["ACADEMIC", "TECHPRO"] },
      { name: "default_section_capacity", label: "Default section capacity" },
      { name: "active", label: "Active", type: "boolean" },
      { name: "reason", label: "Reason for capacity override", optional: true },
    ],
  },
  "school-years": {
    label: "School years",
    model: "schoolyear",
    fields: [
      { name: "name", label: "School year name" },
      { name: "starts_on", label: "Start date", type: "date" },
      { name: "ends_on", label: "End date", type: "date" },
    ],
  },
  "admission-periods": {
    label: "Admission periods",
    model: "admissionperiod",
    fields: [
      { name: "name", label: "Period name" },
      { name: "school_year", label: "School year", relation: "school-years" },
      { name: "opens_on", label: "Opening date", type: "date" },
      { name: "closes_on", label: "Closing date", type: "date" },
      { name: "is_active", label: "Active", type: "boolean" },
    ],
  },
  programs: {
    label: "Programs / specializations",
    model: "program",
    fields: [
      { name: "name", label: "Program or specialization name" },
      { name: "code", label: "Program code", optional: true },
      { name: "track", label: "Track", relation: "tracks" },
      { name: "is_active", label: "Active", type: "boolean" },
    ],
  },
  requirements: {
    label: "Requirement catalog",
    model: "requirement",
    fields: [{ name: "name", label: "Requirement name" }],
  },
  "requirement-rules": {
    label: "Requirement assignments",
    model: "requirementrule",
    fields: [
      { name: "requirement", label: "Requirement", relation: "requirements" },
      {
        name: "admission_period",
        label: "Admission period",
        relation: "admission-periods",
      },
      {
        name: "classification",
        label: "Learner classification",
        options: ["NEW", "TRANSFEREE", "RETURNING"],
      },
      {
        name: "grade_level",
        label: "Grade level",
        options: ["11", "12"],
        optional: true,
      },
      { name: "track", label: "Track", relation: "tracks", optional: true },
      {
        name: "program",
        label: "Program / specialization",
        relation: "programs",
        optional: true,
      },
      { name: "is_required", label: "Required", type: "boolean" },
    ],
  },
};
export function ConfigurationPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState<Resource>("school-years");
  const [editing, setEditing] = useState<ConfigurationRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const allowed = isAdministrator(user);
  const definition = resources[resource];
  const query = useQuery({
    queryKey: ["configuration"],
    queryFn: async () => {
      const result = {} as Record<Resource, ConfigurationRecord[]>;
      await Promise.all(
        (Object.keys(resources) as Resource[]).map(async (key) => {
          result[key] = await apiRequest<ConfigurationRecord[]>(`/${key}/`);
        }),
      );
      return result;
    },
    enabled: allowed,
  });
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiRequest(
        `/${resource}/${editing ? `${editing.id ?? editing.code}/` : ""}`,
        jsonBody(values, editing ? "PATCH" : "POST"),
      ),
    onSuccess: async () => {
      await cache.invalidateQueries();
      setShowForm(false);
      setEditing(null);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    definition.fields.forEach((field) => {
      const raw = String(data.get(field.name) ?? "");
      values[field.name] =
        field.type === "boolean"
          ? data.has(field.name)
          : field.relation === "tracks"
            ? raw
            : field.relation ||
                ["grade_level", "default_section_capacity"].includes(field.name)
              ? raw
                ? Number(raw)
                : null
              : raw;
    });
    save.mutate(values);
  }
  function label(record: ConfigurationRecord) {
    if (record.name) return record.name;
    const requirement =
      query.data?.requirements.find((item) => item.id === record.requirement)
        ?.name ?? "Requirement";
    const period =
      query.data?.["admission-periods"].find(
        (item) => item.id === record.admission_period,
      )?.name ?? "Period";
    return `${requirement} · ${period}`;
  }
  if (!allowed)
    return (
      <Page title="Academic configuration">
        <p role="alert">Administrator access is required.</p>
      </Page>
    );
  return (
    <Page title="Academic configuration">
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label="Configuration area"
      >
        {(Object.keys(resources) as Resource[]).map((key) => (
          <Button
            key={key}
            variant={resource === key ? "primary" : "outline"}
            aria-pressed={resource === key}
            onClick={() => {
              setResource(key);
              setPage(1);
              setShowForm(false);
              setEditing(null);
              save.reset();
            }}
          >
            {resources[key].label}
          </Button>
        ))}
      </div>
      <ErrorMessage error={query.error} />
      {query.isPending && (
        <LoadingState label="Loading academic configuration…" />
      )}
      <section className="panel mb-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{definition.label}</h2>
          {hasPermission(user, `admissions.add_${definition.model}`) && (
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
                save.reset();
              }}
            >
              Add configuration
            </Button>
          )}
        </div>
        {query.data?.[resource].length === 0 && (
          <p className="text-muted">No records configured yet.</p>
        )}
        <ul className="divide-y divide-line">
          {query.data?.[resource]
            .slice((page - 1) * 20, page * 20)
            .map((record) => (
              <li
                key={record.id ?? record.code}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{label(record)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {resource === "requirement-rules"
                      ? `${readable(String(record.classification))} · ${record.grade_level ? `Grade ${record.grade_level}` : "Both grades"} · ${record.track ? String(record.track).replaceAll("_", " ") : "All tracks"} · ${record.is_required ? "Required" : "Optional"}`
                      : record.track
                        ? String(record.track).replaceAll("_", " ")
                        : record.opens_on
                          ? `${record.opens_on} — ${record.closes_on}`
                          : record.starts_on
                            ? `${record.starts_on} — ${record.ends_on}`
                            : resource === "requirements"
                              ? "PDF · 30 MiB max"
                              : ""}
                    {typeof record.is_active === "boolean"
                      ? ` · ${record.is_active ? "Active" : "Inactive"}`
                      : ""}
                  </p>
                </div>
                {hasPermission(
                  user,
                  `admissions.change_${definition.model}`,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(record);
                      setShowForm(true);
                      save.reset();
                    }}
                  >
                    Edit
                  </Button>
                )}
              </li>
            ))}
        </ul>
        {query.data && (
          <Pagination
            count={query.data[resource].length}
            page={page}
            onChange={setPage}
          />
        )}
      </section>
      {showForm && (
        <form
          className="panel space-y-5"
          key={`${resource}-${editing?.id ?? editing?.code ?? "new"}`}
          onSubmit={submit}
        >
          <h2 className="text-xl font-bold">
            {editing ? "Edit" : "Add"} · {definition.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {definition.fields.map((field) =>
              field.type === "boolean" ? (
                <label
                  key={field.name}
                  className="flex min-h-11 items-center gap-3"
                >
                  <input
                    type="checkbox"
                    name={field.name}
                    defaultChecked={
                      editing ? Boolean(editing[field.name]) : true
                    }
                  />
                  {field.label}
                </label>
              ) : (
                <Field key={field.name} label={field.label}>
                  {field.options || field.relation ? (
                    <select
                      name={field.name}
                      required={!field.optional}
                      defaultValue={String(editing?.[field.name] ?? "")}
                    >
                      <option value="">
                        {field.optional
                          ? "All / not limited"
                          : "Choose an option"}
                      </option>
                      {field.relation
                        ? query.data?.[field.relation].map((item) => (
                            <option
                              key={item.id ?? item.code}
                              value={item.id ?? item.code}
                            >
                              {item.name}
                            </option>
                          ))
                        : field.options?.map((value) => (
                            <option key={value} value={value}>
                              {readable(value)}
                            </option>
                          ))}
                    </select>
                  ) : (
                    <input
                      name={field.name}
                      type={field.type ?? "text"}
                      required={!field.optional}
                      defaultValue={String(editing?.[field.name] ?? "")}
                    />
                  )}
                </Field>
              ),
            )}
          </div>
          <ErrorMessage error={save.error} />
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save configuration"}
            </Button>
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}
