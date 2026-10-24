import { LoadingState } from "../components/ui/LoadingState";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { landingPage } from "../lib/access";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const state: unknown = location.state;
  const destination =
    state && typeof state === "object" && "returnTo" in state
      ? state.returnTo
      : null;
  const returnTo =
    typeof destination === "string" &&
    /^\/verify-documents\/[0-9a-f-]{36}$/.test(destination)
      ? destination
      : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorRequired, setFactorRequired] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await auth.login(
        String(data.get("email")),
        String(data.get("password")),
        String(data.get("code") ?? ""),
      );
    } catch (err) {
      if (
        (err as Error).message.includes("Additional authentication required")
      ) {
        setFactorRequired(true);
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth.loading)
    return (
      <Page title="Sign in">
        <LoadingState label="Restoring session…" />
      </Page>
    );
  if (auth.user)
    return <Navigate to={returnTo ?? landingPage(auth.user)} replace />;
  return (
    <section className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-line bg-surface p-7 shadow-panel sm:p-9">
        <h1 className="mb-7 text-2xl font-bold">Sign In</h1>
        <form onSubmit={submit} className="space-y-5">
          <ErrorMessage error={error || auth.error} />
          <Field label="Email">
            <input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {factorRequired && (
            <Field label="Authentication or recovery code">
              <input
                name="code"
                autoComplete="one-time-code"
                maxLength={128}
                required
                autoFocus
              />
            </Field>
          )}
          <button className="action" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-sm text-muted">
            Need an account? Contact the school office.
          </p>
        </form>
      </div>
    </section>
  );
}
