import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth";

export function AccountMenu({
  onSignOut,
  busy,
}: {
  onSignOut: () => void;
  busy: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!user) return null;
  const name = user.first_name
    ? `${user.first_name} ${user.last_name || ""}`
    : user.email.split("@")[0];
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-2 rounded-full p-1 hover:bg-brand-soft lg:rounded-xl lg:px-2"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
          {user.first_name
            ? `${user.first_name[0]}${user.last_name?.[0] || ""}`.toUpperCase()
            : user.email.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-semibold lg:block">
          {name}
        </span>
      </button>
      {open && (
        <div
          id={id}
          className="absolute right-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-3 shadow-dialog"
        >
          <p className="break-all px-2 text-sm font-semibold">{user.email}</p>
          <p className="mb-3 mt-1 px-2 text-xs text-muted">
            {user.role.replaceAll("_", " ")}
          </p>
          <Link
            to={user.role === "LEARNER" ? "/learners" : "/security"}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-brand hover:bg-brand-soft"
            onClick={() => setOpen(false)}
          >
            {user.role === "LEARNER" ? (
              <UserRound size={18} aria-hidden="true" />
            ) : (
              <ShieldCheck size={18} aria-hidden="true" />
            )}
            {user.role === "LEARNER" ? "My Profile" : "Account Security"}
          </Link>
          <button
            disabled={busy}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-brand-soft"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            {busy ? "Signing Out…" : "Sign Out"}
          </button>
        </div>
      )}
    </div>
  );
}
