import { SortableHeader } from "../components/SortableHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";
import { useState, type FormEvent } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPermission, isAdministrator, type Paginated } from "../lib/access";
interface ManagedUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
}
const roles = [
  "LEARNER",
  "REGISTRAR",
  "GUIDANCE_OFFICER",
  "CLASS_ADVISER",
  "ADMINISTRATOR",
];
export function UsersPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("email");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const allowed =
    (isAdministrator(user) || user?.role === "REGISTRAR") &&
    hasPermission(user, "accounts.view_user");
  const query = useQuery({
    queryKey: ["users", page, search, ordering],
    queryFn: () =>
      apiRequest<Paginated<ManagedUser>>(
        `/accounts/users/?${new URLSearchParams({ page: String(page), search, ordering })}`,
      ),
    enabled: allowed,
  });
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiRequest<ManagedUser>(
        editing ? `/accounts/users/${editing.id}/` : "/accounts/users/",
        jsonBody(values, editing ? "PATCH" : "POST"),
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["users"] });
      await cache.invalidateQueries({ queryKey: ["dashboard"] });
      setShowForm(false);
      setEditing(null);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      ...Object.fromEntries(form),
      is_active: form.get("is_active") === "on",
    });
  }
  if (!allowed)
    return (
      <Page
        title={
          user?.role === "REGISTRAR"
            ? "Learner & Teacher Accounts"
            : "User Accounts"
        }
      >
        <p role="alert">User administration permission is required.</p>
      </Page>
    );
  return (
    <Page
      title={
        user?.role === "REGISTRAR"
          ? "Learner & Teacher Accounts"
          : "User Accounts"
      }
    >
      <form
        className="panel mb-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(String(new FormData(event.currentTarget).get("search")));
          setPage(1);
        }}
      >
        <div className="flex-1">
          <Field label="Search accounts">
            <input name="search" type="search" maxLength={150} />
          </Field>
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {hasPermission(user, "accounts.add_user") && (
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
              save.reset();
            }}
          >
            Create account
          </Button>
        )}
      </form>
      <ErrorMessage error={query.error} />
      {query.isPending && <LoadingState label="Loading user accounts…" />}
      {query.data?.results.length === 0 && (
        <p className="panel">No matching accounts.</p>
      )}
      <div
        className="overflow-auto rounded-xl border border-line bg-surface"
        role="region"
        aria-label="User Accounts"
        tabIndex={0}
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-soft">
            <tr>
              {[
                ["Account", "email"],
                ["Role", "role"],
                ["Status", "active"],
                ["Two-Factor Authentication", "mfa"],
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
            {query.data?.results.map((account) => (
              <tr className="border-t border-line" key={account.id}>
                <td className="p-4 font-semibold">{account.email}</td>
                <td className="p-4">
                  {account.is_superuser
                    ? "Superadministrator"
                    : account.role.replaceAll("_", " ")}
                </td>
                <td className="p-4">
                  {account.is_active ? "Active" : "Inactive"}
                </td>
                <td className="p-4">
                  {account.mfa_enabled ? "Enabled" : "Not Enabled"}
                </td>
                <td className="p-4">
                  {user?.role !== "REGISTRAR" &&
                    hasPermission(user, "accounts.change_user") &&
                    account.id !== user?.id &&
                    !account.is_superuser &&
                    (user?.is_superuser ||
                      account.role !== "ADMINISTRATOR") && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(account);
                          setShowForm(true);
                          save.reset();
                        }}
                      >
                        Manage account
                      </Button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.data && (
        <nav
          className="my-5 flex justify-between"
          aria-label="User account pages"
        >
          <Button
            variant="outline"
            disabled={!query.data.previous}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!query.data.next}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </nav>
      )}
      <Dialog
        open={showForm}
        onOpenChange={(value) => {
          if (!save.isPending) setShowForm(value);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {editing ? "Manage Account" : "Create Account"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Account details and access
          </DialogDescription>
          <form
            key={editing?.id ?? "new"}
            className="mt-6 space-y-5"
            onSubmit={submit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={editing?.email}
                  autoComplete="off"
                />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue={editing?.role ?? "LEARNER"}>
                  {roles
                    .filter((role) =>
                      user?.role === "REGISTRAR"
                        ? ["LEARNER", "CLASS_ADVISER"].includes(role)
                        : user?.is_superuser || role !== "ADMINISTRATOR",
                    )
                    .map((role) => (
                      <option key={role} value={role}>
                        {role === "CLASS_ADVISER"
                          ? "Teacher / Class Adviser"
                          : role.replaceAll("_", " ")}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="First name">
                <input name="first_name" defaultValue={editing?.first_name} />
              </Field>
              <Field label="Last name">
                <input name="last_name" defaultValue={editing?.last_name} />
              </Field>
              {!editing && (
                <Field label="Initial account password">
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
              )}
              <label className="flex min-h-11 items-center gap-3">
                <input
                  name="is_active"
                  type="checkbox"
                  defaultChecked={editing?.is_active ?? true}
                />
                Account active
              </label>
            </div>
            <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <Field
                label="Your current password"
                hint="Confirm this administrative action."
              >
                <input
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              {user?.mfa_enabled && (
                <Field label="Your authentication or recovery code">
                  <input name="code" autoComplete="one-time-code" required />
                </Field>
              )}
            </div>
            <ErrorMessage error={save.error} />
            <div className="flex gap-3">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save account"}
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
