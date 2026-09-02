import { Database, FileLock2, Link2, ShieldCheck } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { FoundationPage } from "../pages/FoundationPage";

const capabilities = [
  {
    title: "Access foundation",
    description: "Email identity, JWT sessions, coarse roles, and fine-grained permissions.",
    icon: ShieldCheck,
  },
  {
    title: "Private records",
    description: "Secured storage boundary with no public document URL by default.",
    icon: FileLock2,
  },
  {
    title: "Reliable data",
    description: "PostgreSQL-backed API with append-oriented audit events.",
    icon: Database,
  },
  {
    title: "Blockchain-ready",
    description: "Disabled-by-default provider boundary and local Hardhat environment.",
    icon: Link2,
  },
] as const;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FoundationPage capabilities={capabilities} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
