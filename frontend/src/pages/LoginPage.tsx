import { SchoolFacade } from "../components/SchoolFacade";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/Button";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <section className="mx-auto flex min-h-[calc(100dvh-112px)] max-w-6xl items-center px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full items-center gap-8 md:grid-cols-[1.1fr_1fr] lg:gap-12">
        <SchoolFacade className="hidden md:block" />
        <div className="flex flex-col justify-center rounded-3xl border border-line bg-surface px-6 py-10 shadow-panel sm:px-10 sm:py-14">
          <div
            aria-hidden="true"
            className="mb-5 h-1 w-10 rounded-full bg-brand"
          />
          <h1 className="mb-8 text-3xl font-bold tracking-tight">Sign In</h1>
          <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
            <ErrorMessage error={error || auth.error} />
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </Field>
            <div className="relative">
              <Field label="Password">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="!pr-14"
                  required
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-0 right-1 text-muted"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="login-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            </div>
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
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight aria-hidden="true" />}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
