import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, type LucideIcon } from "lucide-react";

import { getHealth } from "../lib/api";

type Capability = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type FoundationPageProps = {
  capabilities: readonly Capability[];
};

export function FoundationPage({ capabilities }: FoundationPageProps) {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-18">
      <section className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand-soft px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand">
            <CircleDashed size={14} /> Initial foundation
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
            Secure admissions start with a trustworthy foundation.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            The technical boundaries are ready for the client-approved admission workflow. No
            student-facing business rules have been assumed.
          </p>
        </div>

        <aside className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">API status</p>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-bold">
                {health.isSuccess ? "Foundation available" : health.isPending ? "Checking…" : "API offline"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Blockchain is {health.data?.blockchain_enabled ? "enabled" : "disabled by default"}
              </p>
            </div>
            <span
              className={`size-3 rounded-full ${health.isSuccess ? "bg-success" : health.isPending ? "bg-warning" : "bg-danger"}`}
              aria-label={health.isSuccess ? "Online" : "Unavailable"}
            />
          </div>
        </aside>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Foundation capabilities">
        {capabilities.map(({ title, description, icon: Icon }) => (
          <article key={title} className="group rounded-2xl border border-line bg-surface p-5 shadow-panel">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon size={20} aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </section>

      <section className="mt-16 overflow-hidden rounded-3xl bg-ink px-6 py-8 text-white sm:px-10 sm:py-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-mint">
              <CheckCircle2 size={18} /> Guardrail active
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Client-dependent modules remain deferred.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Eligibility, document rules, registration details, public QR data, and production
              blockchain settings will be implemented only after confirmation.
            </p>
          </div>
          <a className="inline-flex items-center gap-2 text-sm font-bold text-mint" href="/api/docs/">
            API documentation <ArrowRight size={17} />
          </a>
        </div>
      </section>
    </div>
  );
}
