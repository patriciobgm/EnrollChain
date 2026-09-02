import { Blocks, Menu } from "lucide-react";
import { Outlet } from "react-router-dom";

import { Button } from "./ui/Button";

export function AppShell() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a className="flex items-center gap-3" href="/" aria-label="EnrollChain home">
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-sm">
              <Blocks aria-hidden="true" size={21} />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight">EnrollChain</span>
              <span className="hidden text-xs text-muted sm:block">Admission integrity platform</span>
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted md:flex">
            <a className="text-brand" href="/">Foundation</a>
            <span aria-disabled="true" title="Awaiting client requirements">Applications</span>
            <span aria-disabled="true" title="Awaiting client requirements">Verification</span>
          </nav>

          <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu size={19} />
          </Button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
