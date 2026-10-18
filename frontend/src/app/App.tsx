import { SectionsPage } from "../pages/SectionsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { BlockchainPage } from "../pages/BlockchainPage";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { ConfigurationPage } from "../pages/ConfigurationPage";
import { AuditPage } from "../pages/AuditPage";
import { UsersPage } from "../pages/UsersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { SuperadminPage } from "../pages/SuperadminPage";
import { SecurityPage } from "../pages/SecurityPage";
import { AppShell } from "../components/AppShell";
import { FoundationPage } from "../pages/FoundationPage";

import { AuthProvider, can, useAuth } from "../lib/auth";
import { ReviewQueuePage } from "../pages/ReviewQueuePage";
import { LoadingState } from "../components/ui/LoadingState";
import { LoginPage } from "../pages/LoginPage";
import { LearnersPage } from "../pages/LearnersPage";
import {
  ApplicationsPage,
  EnrollmentDetailPage,
} from "../pages/ApplicationsPage";
import { ApplicationFormPage } from "../pages/ApplicationFormPage";
import { ApplicationDetailPage } from "../pages/ApplicationDetailPage";

function Protected({ permission }: { permission?: string }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="mx-auto max-w-6xl p-8">
        <LoadingState label="Restoring session…" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(user, permission))
    return (
      <p role="alert" className="p-8">
        Your account does not have access to this page.
      </p>
    );
  return <Outlet />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<FoundationPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route element={<Protected />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="administration"
              element={<DashboardPage administration />}
            />
            <Route path="superadmin" element={<SuperadminPage />} />
            <Route
              path="administration/configuration"
              element={<ConfigurationPage />}
            />
            <Route path="administration/audit" element={<AuditPage />} />
            <Route path="administration/users" element={<UsersPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="reviews" element={<ReviewQueuePage />} />
            <Route path="sections" element={<SectionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="blockchain" element={<BlockchainPage />} />
            <Route path="enrollments/:id" element={<EnrollmentDetailPage />} />
          </Route>
          <Route element={<Protected permission="view_learner" />}>
            <Route path="learners" element={<LearnersPage />} />
          </Route>
          <Route element={<Protected permission="add_application" />}>
            <Route path="applications/new" element={<ApplicationFormPage />} />
          </Route>
          <Route element={<Protected permission="view_application" />}>
            <Route
              path="applications/:id"
              element={<ApplicationDetailPage />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
