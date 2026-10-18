import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../lib/api";
import type { Paginated } from "../lib/access";
import { ErrorMessage, Field } from "./Form";
import { Button } from "./ui/Button";
interface Account {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}
export function ApplicantAccountSelect({
  allowWalkIn = false,
}: {
  allowWalkIn?: boolean;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [walkIn, setWalkIn] = useState(false);
  const [selected, setSelected] = useState("");
  const directory = useQuery({
    queryKey: ["applicant-directory", search, page],
    queryFn: () =>
      apiRequest<Paginated<Account>>(
        `/accounts/directory/?${new URLSearchParams({ search, page: String(page) })}`,
      ),
  });
  return (
    <div className="space-y-3 rounded-xl border border-line p-4 sm:col-span-2">
      {allowWalkIn && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={walkIn}
            onChange={(event) => setWalkIn(event.target.checked)}
          />
          Walk-in learner without an learner account
        </label>
      )}
      {walkIn ? (
        <>
          <input type="hidden" name="owner" value="" />
          <p className="text-sm text-muted">
            This learner will not appear in any learner account until authorized
            staff link the account.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Find learner account">
                <input
                  type="search"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Email or name"
                />
              </Field>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSearch(input.trim());
                setPage(1);
                setSelected("");
              }}
            >
              Find account
            </Button>
          </div>
          <ErrorMessage error={directory.error} />
          <Field
            label="Linked learner account"
            hint="Select the learner’s account."
          >
            <select
              name="owner"
              required
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={directory.isPending}
            >
              <option value="">
                {directory.isPending
                  ? "Loading accounts…"
                  : "Choose an learner account"}
              </option>
              {directory.data?.results.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} {account.first_name} {account.last_name}
                </option>
              ))}
            </select>
          </Field>
          {directory.data?.results.length === 0 && (
            <p role="status" className="text-sm">
              No active learner accounts match. An administrator can provision
              an account.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!directory.data?.previous}
              onClick={() => {
                setPage((value) => value - 1);
                setSelected("");
              }}
            >
              Previous accounts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!directory.data?.next}
              onClick={() => {
                setPage((value) => value + 1);
                setSelected("");
              }}
            >
              More accounts
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
