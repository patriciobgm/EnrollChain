import { LoadingState } from "../components/ui/LoadingState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { apiRequest, jsonBody } from "../lib/api";
import type { Learner } from "../lib/admissions";
import { can, useAuth } from "../lib/auth";

const fields = [
  ["lrn", "LRN", true],
  ["first_name", "First name", true],
  ["middle_name", "Middle name", false],
  ["last_name", "Last name", true],
  ["suffix", "Suffix", false],
  ["birthdate", "Birthdate", true],
  ["sex", "Sex", true],
  ["religion", "Religion (optional)", false],
  [
    "ip_membership",
    "Indigenous Peoples community membership (optional)",
    false,
  ],
  ["address", "Address", true],
  ["contact_number", "Contact number", true],
  ["father_name", "Father’s name", false],
  ["mother_maiden_name", "Mother’s maiden name", false],
  ["guardian_name", "Legal guardian’s name", false],
  ["previous_school", "Previous school", false],
  ["previous_section", "Previous section", false],
] as const;

export function LearnersPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<Learner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const learners = useQuery({
    queryKey: ["learners"],
    queryFn: () => apiRequest<Learner[]>("/learners/"),
  });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest<Learner>(
        editing ? `/learners/${editing.id}/` : "/learners/",
        jsonBody(data, editing ? "PATCH" : "POST"),
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["learners"] });
      setShowForm(false);
      setEditing(null);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (data.owner === "") data.owner = null;
    save.mutate(data);
  }
  return (
    <Page
      title={
        user?.role === "APPLICANT" ? "Learner profile" : "Learner profiles"
      }
    >
      <ErrorMessage error={learners.error} />
      {learners.isPending && <LoadingState label="Loading learner profiles…" />}
      {learners.data?.length === 0 && (
        <p className="panel">
          No learner profiles yet. Add a profile before starting an application.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {learners.data?.map((learner) => (
          <article key={learner.id} className="panel">
            <h2 className="text-lg font-bold">
              {learner.first_name} {learner.last_name}
            </h2>
            <p>
              LRN: {learner.lrn} · Age: {learner.age}
            </p>
            {can(user, "change_learner") && (
              <button
                className="action mt-4"
                onClick={() => {
                  setEditing(learner);
                  setShowForm(true);
                  save.reset();
                }}
              >
                Edit profile
              </button>
            )}
          </article>
        ))}
      </div>
      {can(user, "add_learner") && (
        <button
          className="action my-6"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
            save.reset();
          }}
        >
          Add learner profile
        </button>
      )}
      {showForm && (
        <form
          key={editing?.id ?? "new"}
          className="panel space-y-5"
          onSubmit={submit}
        >
          <h2 className="text-xl font-bold">
            {editing ? "Edit learner" : "New learner"}
          </h2>
          <p className="text-sm text-muted">
            Religion and community membership are optional private information.
            Age is calculated from birthdate.
          </p>
          <ErrorMessage error={save.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([name, label, required]) => (
              <Field label={label} key={name}>
                <input
                  name={name}
                  required={required}
                  defaultValue={editing?.[name] ?? ""}
                  type={
                    name === "birthdate"
                      ? "date"
                      : name === "contact_number"
                        ? "tel"
                        : "text"
                  }
                  max={
                    name === "birthdate"
                      ? new Date().toLocaleDateString("en-CA")
                      : undefined
                  }
                  pattern={name === "lrn" ? "[0-9]{12}" : undefined}
                  inputMode={name === "lrn" ? "numeric" : undefined}
                  maxLength={name === "lrn" ? 12 : undefined}
                />
              </Field>
            ))}
            {user?.role !== "APPLICANT" && !editing && (
              <Field
                label="Applicant account ID (optional)"
                hint="Leave blank for a walk-in learner without an account."
              >
                <input name="owner" />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="action" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="action secondary"
              disabled={save.isPending}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Page>
  );
}
