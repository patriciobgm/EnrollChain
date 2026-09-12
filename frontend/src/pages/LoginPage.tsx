import { LoadingState } from "../components/ui/LoadingState";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ErrorMessage, Field, Page } from "../components/Form";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const auth = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await auth.login(String(data.get("email")), String(data.get("password")));
    } catch (err) {
      setError((err as Error).message);
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
  if (auth.user) return <Navigate to="/applications" replace />;
  return (
    <Page title="Sign in to EnrollChain">
      <form onSubmit={submit} className="panel mx-auto max-w-md space-y-5">
        <p className="text-muted">
          Sto. Domingo National Trade School · Senior High School
        </p>
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
        <button className="action" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-muted">
          Use the account provided by the school. Contact the administrator if
          you need access.
        </p>
      </form>
    </Page>
  );
}
