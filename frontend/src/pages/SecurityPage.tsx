import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { Button } from "../components/ui/Button";
import { apiRequest, jsonBody, setTokens } from "../lib/api";
interface SecurityStatus {
  enabled: boolean;
  recovery_codes_remaining: number;
}
interface Result {
  secret?: string;
  provisioning_uri?: string;
  recovery_codes?: string[];
  detail?: string;
}
export function SecurityPage() {
  const status = useQuery({
    queryKey: ["security"],
    queryFn: () => apiRequest<SecurityStatus>("/accounts/security/"),
  });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("change_password");
  const [finished, setFinished] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<Result>(
        "/accounts/security/",
        jsonBody({ ...Object.fromEntries(new FormData(form)), action }),
      );
      setResult(next);
      form.reset();
      if (action === "enroll") setAction("confirm");
      else {
        setTokens(null);
        setFinished(true);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (finished)
    return (
      <Page title="Security updated">
        <section className="panel max-w-2xl">
          <h2 className="text-xl font-bold">{result?.detail}</h2>
          {result?.recovery_codes && (
            <>
              <p className="mt-4 leading-7">
                Save these codes. Each works once and will not be shown again.
              </p>
              <ul className="my-5 grid gap-2 font-mono sm:grid-cols-2">
                {result.recovery_codes.map((code) => (
                  <li
                    key={code}
                    className="rounded-lg bg-canvas p-3 select-all"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link
            className="action mt-5"
            to="/login"
            onClick={() => window.dispatchEvent(new Event("session-expired"))}
          >
            Return to sign in
          </Link>
        </section>
      </Page>
    );
  return (
    <Page title="Account Security">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel h-fit">
          <h2 className="font-display text-2xl">Security status</h2>
          <ErrorMessage error={status.error} />
          <p className="mt-4 leading-7">
            Two-factor authentication:{" "}
            <strong>
              {status.data
                ? status.data.enabled
                  ? "Enabled"
                  : "Not enabled"
                : "Loading…"}
            </strong>
          </p>
          {status.data?.enabled && (
            <p className="mt-2 text-sm text-muted">
              {status.data.recovery_codes_remaining} recovery codes remaining.
            </p>
          )}
          <p className="mt-4 text-sm leading-6 text-muted">
            Security changes sign out all sessions. Use your current password to
            confirm changes.
          </p>
        </section>
        <form className="panel space-y-5" onSubmit={submit}>
          <Field label="Security action">
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setResult(null);
                setError(null);
              }}
              disabled={busy || action === "confirm"}
            >
              {!status.data?.enabled && (
                <option value="enroll">Set up two-factor authentication</option>
              )}
              {action === "confirm" && (
                <option value="confirm">Confirm authenticator setup</option>
              )}
              {status.data?.enabled && (
                <option value="disable">
                  Disable two-factor authentication
                </option>
              )}
              <option value="change_password">Change password</option>
              <option value="revoke_sessions">Sign out all sessions</option>
            </select>
          </Field>
          {result?.secret && (
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <h2 className="font-semibold">
                Add an account in your authenticator app
              </h2>
              <p className="mt-2 text-sm leading-6">
                Choose a time-based code, name the account EnrollChain, and
                enter this setup key. Setup expires in 10 minutes.
              </p>
              <p className="my-4 break-all font-mono select-all">
                {result.secret}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setAction("enroll");
                  setResult(null);
                }}
              >
                Restart setup
              </Button>
            </div>
          )}
          <Field label="Current password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </Field>
          {(status.data?.enabled || action === "confirm") && (
            <Field
              label="Authentication or recovery code"
              hint={
                action === "confirm"
                  ? "Enter the six-digit code from the authenticator app."
                  : "Each code can be used once. Wait for the next code if you just signed in."
              }
            >
              <input
                name="code"
                autoComplete="one-time-code"
                required
                disabled={busy}
                maxLength={128}
              />
            </Field>
          )}
          {action === "change_password" && (
            <Field label="New password">
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
              />
            </Field>
          )}
          <ErrorMessage error={error} />
          <Button type="submit" disabled={busy || !status.data}>
            {busy
              ? "Updating security…"
              : action === "confirm"
                ? "Confirm and enable MFA"
                : "Continue"}
          </Button>
        </form>
      </div>
    </Page>
  );
}
