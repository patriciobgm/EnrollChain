import { LoadingState } from "../components/ui/LoadingState";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ErrorMessage, Page } from "../components/Form";
import { apiRequest } from "../lib/api";
import type { Application } from "../lib/admissions";
import { can, useAuth } from "../lib/auth";

export function ApplicationsPage() {
  const { user } = useAuth();
  const applications = useQuery({
    queryKey: ["applications"],
    enabled: can(user, "view_application"),
    queryFn: () => apiRequest<Application[]>("/applications/"),
  });
  if (!can(user, "view_application"))
    return (
      <Page title="Welcome">
        <p className="panel">
          Your {user?.role.replaceAll("_", " ").toLowerCase()} account is
          active. Application access has not been assigned. Contact your
          administrator.
        </p>
      </Page>
    );
  return (
    <Page title="Applications">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted">Senior High School · Grades 11 and 12</p>
        {can(user, "add_application") && (
          <Link className="action" to="/applications/new">
            New application
          </Link>
        )}
      </div>
      <ErrorMessage error={applications.error} />
      {applications.isPending && <LoadingState label="Loading applications…" />}
      {applications.data?.length === 0 && (
        <div className="panel">
          <h2 className="font-bold">No applications yet</h2>
          <p>
            Create a learner profile, then start an application for an admission
            period.
          </p>
        </div>
      )}
      <div className="space-y-4">
        {applications.data?.map((app) => (
          <article
            key={app.id}
            className="panel flex flex-wrap items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <h2 className="font-bold">{app.learner_name}</h2>
              <p className="break-all text-sm text-muted">{app.reference}</p>
              <p>
                Grade {app.grade_level} · {app.track.replaceAll("_", " ")} ·{" "}
                {app.classification}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="badge">{app.status}</span>
              <Link className="action secondary" to={`/applications/${app.id}`}>
                View application
              </Link>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
