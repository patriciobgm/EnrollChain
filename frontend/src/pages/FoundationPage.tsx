import { SchoolFacade } from "../components/SchoolFacade";
import {
  ArrowRight,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
export function FoundationPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-brand">
        Sto. Domingo National Trade School
      </p>
      <section className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="relative z-10">
          <h1 className="font-display text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Your next chapter
            <br />
            <span className="text-brand">starts here.</span>
          </h1>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="action gap-3 px-6">
              Start early enrollment
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="action secondary">
              How it works
            </a>
          </div>
        </div>
        <SchoolFacade priority />
      </section>
      <section id="how-it-works" className="mt-16 border-t border-line pt-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="mt-3 font-display text-3xl">
              Early enrollment steps
            </h2>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: GraduationCap,
              title: "Choose your pathway",
              text: "Complete your personal profile and select an available track and cluster, strand or specialization.",
            },
            {
              icon: FileCheck2,
              title: "Complete your requirements",
              text: "Upload private PDFs, attend your guidance interview and follow Registrar feedback.",
            },
            {
              icon: ShieldCheck,
              title: "Follow your enrollment",
              text: "View your section, enrollment status and blockchain verification records.",
            },
          ].map(({ icon: Icon, title, text }, index) => (
            <article className="panel" key={title}>
              <div className="flex items-center justify-between">
                <Icon className="text-brand" aria-hidden="true" />
                <span className="font-display text-3xl text-brand/25">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-5 font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
