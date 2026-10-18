import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorMessage, Field } from "./Form";
interface Policy {
  permissions: {
    id: number;
    name: string;
    codename: string;
    content_type__app_label: string;
  }[];
  users: {
    id: string;
    email: string;
    role: string;
    permissions: number[];
    is_superuser: boolean;
  }[];
}
export function AccessPolicy() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [target, setTarget] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const query = useQuery({
    queryKey: ["access-policy"],
    enabled: !!user?.is_superuser,
    queryFn: () => apiRequest<Policy>("/accounts/access-policy/"),
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest("/accounts/access-policy/", jsonBody(data)),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["access-policy"] });
      setTarget("");
    },
  });
  return (
    <details className="panel mb-6">
      <summary className="cursor-pointer font-bold">
        Advanced access permissions
      </summary>
      <p className="my-4 text-sm text-muted">
        Role permissions remain in effect. Add or remove individual permission
        grants here; server role boundaries still apply. Changes revoke the
        selected user’s existing sessions.
      </p>
      <ErrorMessage error={query.error || save.error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          save.mutate({ ...data, user: target, permissions: checked });
        }}
      >
        <Field label="Account">
          <select
            required
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setChecked(
                query.data?.users.find((u) => u.id === e.target.value)
                  ?.permissions ?? [],
              );
            }}
          >
            <option value="">Choose account</option>
            {query.data?.users
              .filter((u) => !u.is_superuser)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} · {u.role}
                </option>
              ))}
          </select>
        </Field>
        {target && (
          <>
            <fieldset className="max-h-72 overflow-auto rounded-xl border border-line p-4">
              <legend className="px-2 font-semibold">
                Additional individual grants
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {query.data?.permissions.map((p) => (
                  <label className="flex items-center gap-2 text-sm" key={p.id}>
                    <input
                      type="checkbox"
                      checked={checked.includes(p.id)}
                      onChange={(e) =>
                        setChecked((v) =>
                          e.target.checked
                            ? [...v, p.id]
                            : v.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Reason">
              <input name="reason" required maxLength={2000} />
            </Field>
            <Field label="Your current password">
              <input
                type="password"
                name="current_password"
                required
                autoComplete="current-password"
              />
            </Field>
            {user?.mfa_enabled && (
              <Field label="Authentication code">
                <input name="code" required autoComplete="one-time-code" />
              </Field>
            )}
            <button className="action" disabled={save.isPending}>
              Save access permissions
            </button>
          </>
        )}
      </form>
    </details>
  );
}
