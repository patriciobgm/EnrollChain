import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";
import { SortableHeader } from "../components/SortableHeader";
import { Pagination } from "../components/Pagination";
import { ApplicantAccountSelect } from "../components/ApplicantAccountSelect";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { apiRequest, jsonBody } from "../lib/api";
import type { Learner, Paginated } from "../lib/admissions";
import { can, useAuth } from "../lib/auth";

const fields = [
  ["lrn", "LRN (if available)", false],
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
  ["previous_school", "Previous school", true],
  ["last_grade_completed", "Last grade completed", true],
  ["school_year_completed", "School year completed", true],
  ["previous_section", "Previous section", false],
] as const;

export function LearnersPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const applicant = user?.role === "LEARNER";
  const [profileSection, setProfileSection] = useState("Personal information");
  const [ordering, setOrdering] = useState("name");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Learner | null>(null);
  const [linking, setLinking] = useState<Learner | null>(null);
  const [editing, setEditing] = useState<Learner | null>(null);
  const [showForm, setShowForm] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
  }, [showForm, selected]);
  const learners = useQuery({
    queryKey: ["learners", user?.id, search, page, ordering],
    queryFn: async () => {
      if (applicant) {
        const results = await apiRequest<Learner[]>("/learners/");
        return {
          count: results.length,
          results,
          next: null,
          previous: null,
        } as Paginated<Learner>;
      }
      return apiRequest<Paginated<Learner>>(
        `/learners/?${new URLSearchParams({ search, page: String(page), ordering })}`,
      );
    },
  });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest<Learner>(
        editing ? `/learners/${editing.id}/` : "/learners/",
        jsonBody(data, editing ? "PATCH" : "POST"),
      ),
    onSuccess: async () => {
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ["learners"] });
      setShowForm(false);
      setEditing(null);
    },
  });
  const link = useMutation({
    mutationFn: (owner: string) =>
      apiRequest(
        `/learners/${linking!.id}/link-applicant/`,
        jsonBody({ owner }),
      ),
    onSuccess: async () => {
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ["learners"] });
      setLinking(null);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (data.owner === "") data.owner = null;
    if (data.last_grade_completed === "") data.last_grade_completed = null;
    else if (data.last_grade_completed)
      data.last_grade_completed = Number(data.last_grade_completed);
    if (editing) {
      for (const key of Object.keys(data)) {
        if (
          String(data[key] ?? "") ===
          String(editing[key as keyof Learner] ?? "")
        )
          delete data[key];
      }
    }
    save.mutate(data);
  }
  const profile = applicant ? learners.data?.results[0] : selected;
  function editProfile(learner: Learner | null) {
    setEditing(learner);
    setShowForm(true);
    save.reset();
  }
  const groups = [
    {
      title: "Personal information",
      names: [
        "lrn",
        "first_name",
        "middle_name",
        "last_name",
        "suffix",
        "birthdate",
        "sex",
        "religion",
        "ip_membership",
      ],
    },
    { title: "Contact details", names: ["address", "contact_number"] },
    {
      title: "Family",
      names: ["father_name", "mother_maiden_name", "guardian_name"],
    },
    {
      title: "Previous education",
      names: [
        "previous_school",
        "last_grade_completed",
        "school_year_completed",
        "previous_section",
      ],
    },
  ];
  const profileView = profile && (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-panel">
      <div
        className={
          applicant
            ? "flex flex-wrap items-center justify-between gap-5 border-b border-line bg-brand-soft p-6 sm:p-8"
            : "flex flex-wrap items-center justify-between gap-4 border-b border-line bg-brand-soft p-6"
        }
      >
        {applicant && (
          <span className="flex size-16 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">
            {profile.first_name[0]}
            {profile.last_name[0]}
          </span>
        )}
        <div>
          <h2 className="text-2xl font-bold">
            {profile.first_name} {profile.middle_name} {profile.last_name}{" "}
            {profile.suffix}
          </h2>
          <p className="mt-1 text-muted">
            {profile.email || profile.owner_email || "No linked account"}
          </p>
        </div>
        <div className="flex gap-3">
          {!applicant && (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setLinking(null);
              }}
            >
              Back to records
            </Button>
          )}
          {can(user, "change_learner") && (
            <Button onClick={() => editProfile(profile)}>Edit profile</Button>
          )}
        </div>
      </div>
      {
        <div
          role="group"
          aria-label="Profile sections"
          className="flex flex-wrap gap-2 border-b border-line px-6 py-3"
        >
          {groups.map((group) => (
            <button
              key={group.title}
              aria-pressed={profileSection === group.title}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${profileSection === group.title ? "bg-brand text-white" : "text-muted"}`}
              onClick={() => setProfileSection(group.title)}
            >
              {group.title === "Personal information"
                ? "Personal"
                : group.title === "Contact details"
                  ? "Contact"
                  : group.title === "Previous education"
                    ? "Education"
                    : group.title}
            </button>
          ))}
        </div>
      }
      {groups
        .filter((group) => group.title === profileSection)
        .map((group) => (
          <section
            key={group.title}
            className={
              applicant ? "space-y-5 p-6 sm:p-8" : "space-y-5 p-6 sm:p-8"
            }
          >
            <h2 className="font-bold">{group.title}</h2>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {fields
                .filter(([name]) => group.names.includes(name))
                .map(([name, label]) => (
                  <div key={name} className="border-b border-line/60 pb-4">
                    <dt className="text-sm text-muted">
                      {label
                        .replace(" (optional)", "")
                        .replace(" (if available)", "")}
                    </dt>
                    <dd className="mt-1 break-words font-medium">
                      {profile[name] || "—"}
                    </dd>
                  </div>
                ))}
              {group.title === "Personal information" && (
                <div>
                  <dt className="text-sm text-muted">Age</dt>
                  <dd className="mt-1 font-medium">{profile.age ?? "—"}</dd>
                </div>
              )}
            </dl>
          </section>
        ))}
      {!profile.owner &&
        !applicant &&
        can(user, "change_learner") &&
        !linking && (
          <Button
            variant="outline"
            onClick={() => {
              setLinking(profile);
              link.reset();
            }}
          >
            Link learner account
          </Button>
        )}
      {linking && (
        <form
          className="max-w-lg space-y-4 border-t border-line pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            link.mutate(String(new FormData(event.currentTarget).get("owner")));
          }}
        >
          <h2 className="font-bold">Link learner account</h2>
          <ApplicantAccountSelect />
          <ErrorMessage error={link.error} />
          <div className="flex gap-3">
            <Button type="submit" disabled={link.isPending}>
              Confirm account link
            </Button>
            <Button variant="outline" onClick={() => setLinking(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
  return (
    <Page
      title={
        showForm
          ? editing
            ? "Edit profile"
            : applicant
              ? "Complete my profile"
              : "Add learner"
          : applicant
            ? "My Profile"
            : "Learner Records"
      }
    >
      <ErrorMessage error={learners.error} />
      {learners.isPending && <LoadingState label="Loading profiles…" />}
      {showForm ? (
        <form
          key={editing?.id ?? "new"}
          onSubmit={submit}
          className="max-w-4xl space-y-8"
        >
          <ErrorMessage error={save.error} />
          {groups.map((group) => (
            <fieldset key={group.title} className="border-b border-line pb-8">
              <legend className="mb-5 text-lg font-bold">{group.title}</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                {fields
                  .filter(([name]) => group.names.includes(name))
                  .map(([name, label, required]) => (
                    <Field label={label} key={name}>
                      <input
                        name={name}
                        required={required}
                        defaultValue={editing?.[name] ?? ""}
                        type={
                          name === "last_grade_completed"
                            ? "number"
                            : name === "birthdate"
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
              </div>
            </fieldset>
          ))}
          {!applicant && !editing && <ApplicantAccountSelect allowWalkIn />}
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : applicant && profile ? (
        profileView
      ) : applicant ? (
        learners.data && (
          <div className="space-y-4">
            <p className="text-muted">No profile yet.</p>
            {can(user, "add_learner") && (
              <Button onClick={() => editProfile(null)}>
                Complete my profile
              </Button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <Field label="Search name, LRN or email">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            {can(user, "add_learner") && (
              <Button onClick={() => editProfile(null)}>Add learner</Button>
            )}
          </div>
          <div
            className="overflow-auto rounded-xl border border-line bg-surface"
            role="region"
            aria-label="Learner Records"
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-soft">
                <tr>
                  {[
                    ["Learner", "name"],
                    ["LRN", "lrn"],
                    ["Learner Account", "email"],
                    ["Previous School", "school"],
                  ].map(([label, column]) => (
                    <SortableHeader
                      key={column}
                      label={label}
                      column={column}
                      ordering={ordering}
                      onSort={(value) => {
                        setOrdering(value);
                        setPage(1);
                      }}
                    />
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {learners.data?.results.map((l) => (
                  <tr className="border-t border-line" key={l.id}>
                    <td className="p-4 font-semibold">
                      {l.last_name}, {l.first_name} {l.middle_name}
                    </td>
                    <td className="p-4">{l.lrn || "—"}</td>
                    <td className="p-4">{l.owner_email || "Unlinked"}</td>
                    <td className="p-4">{l.previous_school || "—"}</td>
                    <td className="p-4">
                      <Button
                        variant="outline"
                        aria-label={`View ${l.first_name} ${l.last_name}`}
                        onClick={() => setSelected(l)}
                      >
                        View profile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {learners.data?.count === 0 && (
            <p className="py-6 text-muted">No learners found.</p>
          )}
          {learners.data && (
            <Pagination
              count={learners.data.count}
              page={page}
              onChange={setPage}
              busy={learners.isFetching}
            />
          )}
        </>
      )}
      {!applicant && (
        <Dialog
          open={!!selected && !showForm}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogTitle>Learner Record</DialogTitle>
            <DialogDescription className="sr-only">
              Learner profile details
            </DialogDescription>
            <div className="mt-5">{profileView}</div>
          </DialogContent>
        </Dialog>
      )}
    </Page>
  );
}
