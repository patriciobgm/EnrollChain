import {
  CalendarDays,
  CalendarRange,
  GitBranch,
  GraduationCap,
  FileCheck2,
  ListChecks,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";
import { readable } from "../lib/admissions";
import { Pagination } from "../components/Pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
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
  type?: "date" | "boolean" | "number";
  options?: readonly string[];
  relation?: Resource;
  optional?: boolean;
}

const resources: Record<
  Resource,
  { label: string; model: string; fields: ConfigField[] }
> = {
  tracks: {
    label: "Tracks & Capacities",
    model: "trackconfiguration",
    fields: [
      { name: "code", label: "Stable track code" },
      { name: "name", label: "Track name" },
      { name: "category", label: "Category", options: ["ACADEMIC", "TECHPRO"] },
      {
        name: "default_section_capacity",
        label: "Default Section Capacity",
        type: "number",
      },
      { name: "active", label: "Active", type: "boolean" },
      { name: "reason", label: "Reason for capacity override", optional: true },
    ],
  },
  "school-years": {
    label: "School Years",
    model: "schoolyear",
    fields: [
      { name: "name", label: "School year name" },
      { name: "starts_on", label: "Start date", type: "date" },
      { name: "ends_on", label: "End date", type: "date" },
    ],
  },
  "admission-periods": {
    label: "Admission Periods",
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
    label: "Programs / Specializations",
    model: "program",
    fields: [
      { name: "name", label: "Program or specialization name" },
      { name: "code", label: "Program code", optional: true },
      { name: "track", label: "Track", relation: "tracks" },
      { name: "is_active", label: "Active", type: "boolean" },
    ],
  },
  requirements: {
    label: "Requirement Catalog",
    model: "requirement",
    fields: [{ name: "name", label: "Requirement name" }],
  },
  "requirement-rules": {
    label: "Requirement Assignments",
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
const areaIcons = {
  "school-years": CalendarDays,
  "admission-periods": CalendarRange,
  tracks: GitBranch,
  programs: GraduationCap,
  requirements: FileCheck2,
  "requirement-rules": ListChecks,
};
export function ConfigurationPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const formTrigger = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
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
  const records =
    query.data?.[resource].filter((record) =>
      label(record).toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  if (!allowed)
    return (
      <Page title="Academic Configuration">
        <p role="alert">Administrator access is required.</p>
      </Page>
    );
  return (
    <Page title="Academic Configuration">
      <div className="mb-4 sm:hidden">
        <Field label="Configuration Area">
          <select
            value={resource}
            onChange={(e) => {
              setResource(e.target.value as Resource);
              setPage(1);
              setSearch("");
              setEditing(null);
              setShowForm(false);
              save.reset();
            }}
          >
            {(Object.keys(resources) as Resource[]).map((key) => (
              <option key={key} value={key}>
                {resources[key].label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div
        className="mb-6 hidden grid-cols-2 gap-3 sm:grid xl:grid-cols-3"
        role="group"
        aria-label="Configuration area"
      >
        {(Object.keys(resources) as Resource[]).map((key) => {
          const Icon = areaIcons[key];
          return (
            <Button
              key={key}
              className="h-auto min-h-20 justify-start whitespace-normal px-4 py-3 text-left"
              variant={resource === key ? "primary" : "outline"}
              aria-pressed={resource === key}
              onClick={() => {
                setResource(key);
                setPage(1);
                setSearch("");
                setShowForm(false);
                setEditing(null);
                save.reset();
              }}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="flex-1">{resources[key].label}</span>
              <span className="rounded-md bg-surface/15 px-2 py-1 text-xs tabular-nums">
                {query.data?.[key].length ?? "—"}
              </span>
            </Button>
          );
        })}
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
              onClick={(event) => {
                formTrigger.current = event.currentTarget;
                setEditing(null);
                setShowForm(true);
                save.reset();
              }}
            >
              <Plus aria-hidden="true" /> Add configuration
            </Button>
          )}
        </div>
        <div className="mb-5 max-w-md">
          <Field label="Search Configuration">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${definition.label.toLowerCase()}`}
            />
          </Field>
        </div>
        {query.data && records.length === 0 && (
          <p className="text-muted">
            {search
              ? "No matching configuration."
              : "No records configured yet."}
          </p>
        )}
        <ul className="grid gap-4 lg:grid-cols-2">
          {records.slice((page - 1) * 20, page * 20).map((record) => (
            <li
              key={record.id ?? record.code}
              className="flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-xl border border-line bg-canvas/40 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{label(record)}</p>
                <p className="mt-1 text-sm text-muted">
                  {resource === "tracks"
                    ? `${readable(String(record.category))} · Capacity: ${record.default_section_capacity} · ${record.active ? "Active" : "Inactive"}`
                    : resource === "requirement-rules"
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
              {hasPermission(user, `admissions.change_${definition.model}`) && (
                <Button
                  variant="outline"
                  onClick={(event) => {
                    formTrigger.current = event.currentTarget;
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
          <Pagination count={records.length} page={page} onChange={setPage} />
        )}
      </section>
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!save.isPending) setShowForm(open);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            formTrigger.current?.focus();
          }}
        >
          <DialogTitle>
            {editing ? "Edit Configuration" : "Add Configuration"}
          </DialogTitle>
          <DialogDescription>{definition.label}</DialogDescription>
          <form
            className="mt-5 space-y-5"
            key={`${resource}-${editing?.id ?? editing?.code ?? "new"}`}
            onSubmit={submit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {definition.fields.map((field) =>
                field.type === "boolean" ? (
                  <label
                    key={field.name}
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-canvas px-4 sm:col-span-2"
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
                  <div
                    key={field.name}
                    className={
                      field.name === "name" || field.name === "reason"
                        ? "sm:col-span-2"
                        : ""
                    }
                  >
                    <Field
                      label={`${field.label.replace(/\b\w/g, (letter) => letter.toUpperCase())}${field.optional ? " (Optional)" : ""}`}
                    >
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
                          min={field.type === "number" ? 1 : undefined}
                          step={field.type === "number" ? 1 : undefined}
                          required={!field.optional}
                          defaultValue={String(editing?.[field.name] ?? "")}
                        />
                      )}
                    </Field>
                  </div>
                ),
              )}
            </div>
            <ErrorMessage error={save.error} />
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save Configuration"}
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
        </DialogContent>
      </Dialog>
    </Page>
  );
}
