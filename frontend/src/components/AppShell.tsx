import { Blocks, ClipboardCheck, LogOut } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { can, useAuth } from "../lib/auth";
import { canViewReviews } from "../lib/reviews";
import { Button } from "./ui/Button";
import { ErrorMessage } from "./Form";

export function AppShell() {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch {
      setError(
        "Signed out locally. The server could not revoke the session; it will expire automatically.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <header className="border-t-4 border-t-brand border-b border-b-ink/10 bg-surface/95 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <Link
            className="flex items-center gap-3"
            to="/"
            aria-label="EnrollChain home"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-white">
              <Blocks aria-hidden="true" size={21} />
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">
                EnrollChain
              </span>
              <span className="block text-xs text-muted">
                Sto. Domingo National Trade School
              </span>
            </span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex flex-wrap items-center gap-4 text-sm font-medium"
          >
            <NavLink to="/">Home</NavLink>
            {user ? (
              <>
                {can(user, "view_learner") && (
                  <NavLink to="/learners">Learner profiles</NavLink>
                )}
                {can(user, "view_application") && (
                  <NavLink to="/applications">Applications</NavLink>
                )}
                {canViewReviews(user) && (
                  <NavLink
                    className="inline-flex min-h-11 items-center gap-2"
                    to="/reviews"
                  >
                    <ClipboardCheck size={16} aria-hidden="true" />
                    Document review
                  </NavLink>
                )}
                <span className="text-xs text-muted">
                  {user.role.replaceAll("_", " ")}
                </span>
                <Button
                  onClick={() => void signOut()}
                  disabled={busy}
                  variant="outline"
                >
                  <LogOut aria-hidden="true" />
                  {busy ? "Signing out…" : "Sign out"}
                </Button>
              </>
            ) : (
              <NavLink className="action" to="/login">
                Sign in
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <ErrorMessage error={error} />
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
