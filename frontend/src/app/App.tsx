import { Database, FileLock2, Link2, ShieldCheck } from "lucide-react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { FoundationPage } from "../pages/FoundationPage";

import { AuthProvider, can, useAuth } from "../lib/auth";
import { ReviewQueuePage } from "../pages/ReviewQueuePage";
import { LoadingState } from "../components/ui/LoadingState";
import { LoginPage } from "../pages/LoginPage";
import { LearnersPage } from "../pages/LearnersPage";
import { ApplicationsPage } from "../pages/ApplicationsPage";
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

const capabilities = [
  {
    title: "Access foundation",
    description:
      "Email identity, JWT sessions, coarse roles, and fine-grained permissions.",
    icon: ShieldCheck,
  },
  {
    title: "Private records",
    description:
      "Secured storage boundary with no public document URL by default.",
    icon: FileLock2,
  },
  {
    title: "Reliable data",
    description: "PostgreSQL-backed API with append-oriented audit events.",
    icon: Database,
  },
  {
    title: "Blockchain-ready",
    description:
      "Disabled-by-default provider boundary and local Hardhat environment.",
    icon: Link2,
  },
] as const;

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={<FoundationPage capabilities={capabilities} />}
          />
          <Route path="login" element={<LoginPage />} />
          <Route element={<Protected />}>
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="reviews" element={<ReviewQueuePage />} />
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
