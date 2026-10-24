import { AccountMenu } from "./AccountMenu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/Dialog";
import { NotificationCenter } from "./NotificationCenter";
import { useRef, useState } from "react";
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
  const menuTrigger = useRef<HTMLButtonElement>(null);
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
      className="flex min-w-0 items-center gap-2 lg:gap-3"
    >
      <img
        src="/assets/school-logo.png"
        alt=""
        className="size-9 shrink-0 rounded-full bg-white object-contain lg:size-12"
        width={48}
        height={48}
      />
      <span>
        <span className="block text-lg font-bold tracking-tight lg:text-xl">
          EnrollChain
        </span>
      </span>
    </Link>
  );
  const account = user && (
    <div className="flex items-center gap-2">
      <NotificationCenter />
      <AccountMenu onSignOut={() => void signOut()} busy={busy} />
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
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line bg-surface px-3 lg:hidden">
            {brand}
            <div className="flex shrink-0 items-center gap-1">
              {account}
              <Button
                ref={menuTrigger}
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                aria-expanded={menu}
                aria-controls="mobile-navigation"
                onClick={() => setMenu(true)}
              >
                <Menu aria-hidden="true" />
              </Button>
            </div>
          </header>
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-line bg-surface p-4 lg:block">
            <div className="mb-7">{brand}</div>
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
              {user.role.replaceAll("_", " ")}
            </p>
            <nav aria-label="Main navigation" className="space-y-1">
              {links(items)}
              {administration.length > 0 && (
                <>
                  <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    Administration
                  </p>
                  {links(administration)}
                </>
              )}
              <div className="mt-5 border-t border-line pt-3">
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
          <Dialog open={menu} onOpenChange={setMenu}>
            <DialogContent
              id="mobile-navigation"
              className="left-0 top-0 h-dvh max-h-dvh w-[min(86vw,320px)] max-w-none translate-x-0 translate-y-0 rounded-none rounded-r-2xl border-0 p-4 sm:p-4"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                menuTrigger.current?.focus();
              }}
            >
              <DialogTitle className="mb-5 font-sans text-lg">
                Navigation
              </DialogTitle>
              <DialogDescription className="sr-only">
                School workspace navigation
              </DialogDescription>
              <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                {user.role.replaceAll("_", " ")}
              </p>
              <nav aria-label="Main navigation" className="space-y-1">
                {links(items)}
                {administration.length > 0 && (
                  <>
                    <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      Administration
                    </p>
                    {links(administration)}
                  </>
                )}
                <div className="mt-5 border-t border-line pt-3">
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
            </DialogContent>
          </Dialog>
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
