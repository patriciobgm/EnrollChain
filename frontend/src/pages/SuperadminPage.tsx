import { AccessPolicy } from "../components/AccessPolicy";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ErrorMessage, Page } from "../components/Form";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
interface SystemStatus {
  database: string;
  blockchain_enabled: boolean;
  blockchain_integration: string;
  debug: boolean;
  mfa_encryption_configured: boolean;
}
export function SuperadminPage() {
  const { user } = useAuth();
  const status = useQuery({
    queryKey: ["system"],
    queryFn: () => apiRequest<SystemStatus>("/accounts/system/"),
    enabled: !!user?.is_superuser,
  });
  if (!user?.is_superuser)
    return (
      <Page title="System administration">
        <p role="alert">Superadministrator access is required.</p>
      </Page>
    );
  return (
    <Page title="System administration">
      <section className="panel mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">
          Superuser
        </p>
        <h2 className="mt-3 font-display text-3xl">
          System access and operational status
        </h2>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="action" to="/administration">
            School administration
          </Link>
          <Link className="action secondary" to="/security">
            Account security
          </Link>
          <Link className="action secondary" to="/administration/users">
            Users and roles
          </Link>
        </div>
      </section>
      <AccessPolicy />
      <ErrorMessage error={status.error} />
      {status.isPending && <LoadingState label="Loading system status…" />}
      {status.data && (
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Database", status.data.database],
            ["Blockchain integration", status.data.blockchain_integration],
            [
              "Runtime mode",
              status.data.debug ? "Development" : "Production configuration",
            ],
            [
              "MFA encryption",
              status.data.mfa_encryption_configured
                ? "Dedicated encryption key configured"
                : "Development key; configure a dedicated key before deployment",
            ],
          ].map(([label, value]) => (
            <div className="panel" key={label}>
              <dt className="font-semibold">{label}</dt>
              <dd className="mt-2 text-sm text-muted">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Page>
  );
}
