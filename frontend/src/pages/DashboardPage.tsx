import { EnrollmentSummary } from "../components/EnrollmentSummary";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EnrollmentMetrics } from "../components/EnrollmentMetrics";
import { ErrorMessage, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { type Enrollment, type Paginated } from "../lib/admissions";
import { can, useAuth } from "../lib/auth";
import { hasPermission, isAdministrator } from "../lib/access";
import { canViewReviews } from "../lib/reviews";
const titles: Record<string, string> = {
  LEARNER: "My overview",
  REGISTRAR: "Registrar overview",
  ADMINISTRATOR: "School Overview",
  GUIDANCE_OFFICER: "Guidance overview",
  CLASS_ADVISER: "Adviser overview",
};
export function DashboardPage({
  administration = false,
}: {
  administration?: boolean;
}) {
  const { user } = useAuth();
  const allowed = !administration || isAdministrator(user);
  const applicant = user?.role === "LEARNER";
  const guidance = user?.role === "GUIDANCE_OFFICER";
  const records = useQuery({
    queryKey: ["dashboard-enrollments", user?.id],
    enabled: allowed && (applicant || guidance),
    queryFn: () =>
      apiRequest<Paginated<Enrollment>>(
        `/enrollments/${guidance ? "?interview=pending" : ""}`,
      ),
  });
  if (!allowed)
    return (
      <Page title="School Overview">
        <p role="alert">Administrator access is required.</p>
      </Page>
    );
  const cards: { to: string; title: string; text: string; icon: LucideIcon }[] =
    [];
  if (can(user, "view_learner"))
    cards.push({
      to: "/learners",
      title: applicant ? "My Profile" : "Learner Records",
      text: applicant
        ? "Personal and previous school information"
        : "Profiles and learner account links",
      icon: Users,
    });
  if (can(user, "view_application") || guidance)
    cards.push({
      to: "/applications",
      title: applicant
        ? "My Enrollment"
        : guidance
          ? "Guidance Interviews"
          : "Early Enrollment",
      text: guidance
        ? "Record completed interviews"
        : "Applications and enrollment progress",
      icon: FileText,
    });
  if (canViewReviews(user))
    cards.push({
      to: "/reviews",
      title: "Document Review",
      text:
        user?.role === "REGISTRAR"
          ? "Review PDFs and request corrections"
          : "Review decisions and document history",
      icon: ClipboardCheck,
    });
  if (hasPermission(user, "admissions.view_section"))
    cards.push({
      to: "/sections",
      title: user?.role === "CLASS_ADVISER" ? "My Sections" : "Sections",
      text: "Capacity, assignments and rosters",
      icon: GraduationCap,
    });
  if (isAdministrator(user))
    cards.push({
      to: "/administration/configuration",
      title: "School Configuration",
      text: "Years, tracks, programs and requirements",
      icon: Settings2,
    });
  return (
    <Page title={titles[user?.role ?? ""] ?? "Overview"}>
      {applicant && (
        <>
          <ErrorMessage error={records.error} />
          {records.isPending && (
            <LoadingState label="Loading your enrollment…" />
          )}
          {records.data?.count === 0 && (
            <section className="panel mb-6">
              <h2 className="text-xl font-bold">Start early enrollment</h2>
              <p className="mt-2 text-muted">
                Complete your profile, then choose a track and program.
              </p>
              <Link className="action mt-4" to="/learners">
                Complete my profile
              </Link>
            </section>
          )}
          <div className="mb-6 space-y-6">
            {records.data?.results.map((app) => (
              <EnrollmentSummary key={app.id} app={app} />
            ))}
          </div>
        </>
      )}
      {guidance && (
        <section className="panel mb-6">
          <h2 className="text-lg font-bold">Pending interviews</h2>
          <ErrorMessage error={records.error} />
          {records.isPending ? (
            <LoadingState label="Loading interview queue…" />
          ) : (
            <p className="my-3 text-3xl font-bold">
              {records.data?.count ?? "—"}
            </p>
          )}
          <Link className="action secondary" to="/applications">
            Open interview queue
          </Link>
        </section>
      )}
      {!applicant && !guidance && <EnrollmentMetrics />}
      <section className="panel" aria-label="Quick actions">
        <h2 className="mb-4 font-bold">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          {cards.map(({ to, title, icon: Icon }) => (
            <Link key={to} to={to} className="action secondary gap-2">
              <Icon size={18} aria-hidden="true" />
              {title}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      {!user?.mfa_enabled && (
        <Link
          to="/security"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand"
        >
          <ShieldCheck size={18} aria-hidden="true" />
          Enable two-factor authentication
        </Link>
      )}
    </Page>
  );
}
