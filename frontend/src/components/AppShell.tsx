import { NotificationCenter } from "./NotificationCenter";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { hasPermission, isAdministrator, landingPage } from "../lib/access";
import { canViewReviews } from "../lib/reviews";
import { Button } from "./ui/Button";
import { ErrorMessage } from "./Form";
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}
export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch {
      setError(
        "Signed out locally. The server session will expire automatically.",
      );
    } finally {
      setBusy(false);
    }
  }
  const items: NavItem[] = user
    ? [
        { to: landingPage(user), label: "Overview", icon: LayoutDashboard },
        ...(can(user, "view_learner")
          ? [
              {
                to: "/learners",
                label:
                  user.role === "LEARNER" ? "My Profile" : "Learner Records",
                icon: UserRound,
              },
            ]
          : []),
        ...(can(user, "view_application") || user.role === "GUIDANCE_OFFICER"
          ? [
              {
                to: "/applications",
                label:
                  user.role === "LEARNER"
                    ? "My Enrollment"
                    : user.role === "GUIDANCE_OFFICER"
                      ? "Guidance Interviews"
                      : "Early Enrollment",
                icon: FileText,
              },
            ]
          : []),
        ...(canViewReviews(user)
          ? [{ to: "/reviews", label: "Document Review", icon: ClipboardCheck }]
          : []),
        ...(hasPermission(user, "admissions.view_section")
          ? [
              {
                to: "/sections",
                label:
                  user.role === "CLASS_ADVISER" ? "My Sections" : "Sections",
                icon: GraduationCap,
              },
            ]
          : []),
        ...(hasPermission(user, "admissions.view_enrollment_reports")
          ? [{ to: "/reports", label: "Reports", icon: BarChart3 }]
          : []),
        ...(user.role === "LEARNER" ||
        hasPermission(user, "blockchain_records.view_blockchaintransaction")
          ? [
              {
                to: "/blockchain",
                label: "Blockchain Verification",
                icon: Link2,
              },
            ]
          : []),
      ]
    : [];
  const administration: NavItem[] = isAdministrator(user)
    ? [
        {
          to: "/administration/configuration",
          label: "School Configuration",
          icon: Settings2,
        },
        ...(hasPermission(user, "accounts.view_user")
          ? [
              {
                to: "/administration/users",
                label: "Users & Access",
                icon: Users,
              },
            ]
          : []),
        ...(hasPermission(user, "audit.view_auditevent")
          ? [
              {
                to: "/administration/audit",
                label: "Audit Logs",
                icon: ClipboardCheck,
              },
            ]
          : []),
        ...(user?.is_superuser
          ? [{ to: "/superadmin", label: "System Settings", icon: ShieldCheck }]
          : []),
      ]
    : user?.role === "REGISTRAR" && hasPermission(user, "accounts.view_user")
      ? [
          {
            to: "/administration/users",
            label: "Learner & Teacher Accounts",
            icon: Users,
          },
        ]
      : [];
  const brand = (
    <Link
      to={user ? landingPage(user) : "/"}
      aria-label="EnrollChain home"
      className="flex items-center gap-3"
    >
      <img
        src="/assets/school-logo.png"
        alt=""
        className="size-12 rounded-full bg-white object-contain"
        width={48}
        height={48}
      />
      <span>
        <span className="block text-xl font-bold tracking-tight">
          EnrollChain
        </span>
      </span>
    </Link>
  );
  const account = user && (
    <div className="flex items-center gap-2">
      <NotificationCenter />
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-line bg-surface p-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
            {user.first_name
              ? `${user.first_name[0]}${user.last_name?.[0] || ""}`.toUpperCase()
              : user.email.slice(0, 2).toUpperCase()}
          </span>
          <span className="hidden max-w-48 truncate text-sm font-semibold sm:block">
            {user.first_name
              ? `${user.first_name} ${user.last_name || ""}`
              : user.email.split("@")[0]}
          </span>
        </summary>
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-4 shadow-panel">
          <p className="break-all text-sm font-semibold">{user.email}</p>
          <p className="my-2 text-xs text-muted">
            {user.role.replaceAll("_", " ")}
          </p>
          <Link
            to={user.role === "LEARNER" ? "/learners" : "/security"}
            className="block py-2 text-sm text-brand"
            onClick={(e) =>
              e.currentTarget.closest("details")?.removeAttribute("open")
            }
          >
            {user.role === "LEARNER" ? "My Profile" : "Account Security"}
          </Link>
          <button
            className="py-2 text-sm font-semibold"
            onClick={() => void signOut()}
          >
            Sign Out
          </button>
        </div>
      </details>
    </div>
  );
  function links(entries: NavItem[]) {
    return entries.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/administration" || to === "/dashboard"}
        onClick={() => setMenu(false)}
        className={({ isActive }) =>
          `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-brand-soft hover:text-brand"}`
        }
      >
        <Icon size={18} aria-hidden="true" />
        <span>{label.replace(/\b[a-z]/g, (c) => c.toUpperCase())}</span>
      </NavLink>
    ));
  }
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      {user ? (
        <>
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-5 py-3 backdrop-blur lg:hidden">
            {brand}
            {account}
            <Button
              variant="ghost"
              size="icon"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="school-navigation"
              onClick={() => setMenu((value) => !value)}
            >
              {menu ? <X /> : <Menu />}
            </Button>
          </header>
          <aside
            id="school-navigation"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMenu(false);
                window.document
                  .querySelector<HTMLButtonElement>(
                    '[aria-controls="school-navigation"]',
                  )
                  ?.focus();
              }
            }}
            className={`${menu ? "block" : "hidden"} fixed bottom-0 top-[73px] z-30 w-64 overflow-y-auto border-r border-line bg-surface p-5 shadow-panel lg:top-0 lg:block lg:shadow-none`}
          >
            <div className="mb-8 hidden lg:block">{brand}</div>
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
              {user.role.replaceAll("_", " ")}
            </p>
            <nav aria-label="Main navigation" className="space-y-1">
              {links(items)}
              {administration.length > 0 && (
                <>
                  <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    Administration
                  </p>
                  {links(administration)}
                </>
              )}
              <div className="mt-6 border-t border-line pt-4">
                {links([
                  {
                    to: "/security",
                    label: "Account Security",
                    icon: ShieldCheck,
                  },
                ])}
                <Button
                  variant="ghost"
                  className="mt-2 w-full justify-start px-3"
                  onClick={() => void signOut()}
                  disabled={busy}
                >
                  <LogOut aria-hidden="true" />
                  {busy ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </nav>
          </aside>
          <div className="lg:pl-64">
            <div className="hidden items-center justify-between border-b border-line bg-surface px-8 py-4 lg:flex">
              <div>
                <p className="text-xs text-muted">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {[...items, ...administration]
                    .filter((item) => location.pathname.startsWith(item.to))
                    .sort((a, b) => b.to.length - a.to.length)[0]?.label ||
                    "Account Security"}
                </p>
              </div>
              {account}
            </div>
            <ErrorMessage error={error} />
            <main id="main-content">
              <Outlet />
            </main>
          </div>
        </>
      ) : (
        <>
          <header className="border-t-4 border-brand border-b border-b-line bg-surface">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
              {brand}
              <nav
                aria-label="Main navigation"
                className="flex items-center gap-5"
              >
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center border-b-2 text-sm font-semibold ${isActive ? "border-brand text-brand" : "border-transparent text-muted"}`
                  }
                >
                  Home
                </NavLink>
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center border-b-2 text-sm font-semibold ${isActive ? "border-brand text-brand" : "border-transparent text-muted"}`
                  }
                >
                  Sign In
                </NavLink>
              </nav>
            </div>
          </header>
          <main id="main-content">
            <Outlet />
          </main>
        </>
      )}
    </div>
  );
}
