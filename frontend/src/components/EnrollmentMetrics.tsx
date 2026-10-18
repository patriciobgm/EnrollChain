import { LoadingState } from "./ui/LoadingState";
import { useAuth } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { readable } from "../lib/admissions";
import { ErrorMessage } from "./Form";
interface Metrics {
  total: number;
  categories: Record<string, number>;
  statuses: Record<string, number>;
  unassigned: number;
  lis: Record<string, number>;
  tracks: Record<string, number>;
  sections: { id: number; name: string; capacity: number; assigned: number }[];
}
export function EnrollmentMetrics() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["enrollment-metrics"],
    queryFn: () => apiRequest<Metrics>("/enrollment-metrics/"),
  });
  const d = q.data;
  return (
    <section aria-label="Early enrollment monitoring" className="mb-7">
      <ErrorMessage error={q.error} />
      {q.isPending && <LoadingState label="Loading enrollment summary…" />}
      {d && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {(user?.role === "CLASS_ADVISER"
              ? [
                  ["Assigned Learners", d.total],
                  ["My Sections", d.sections.length],
                  [
                    "Available Places",
                    d.sections.reduce(
                      (total, section) =>
                        total + section.capacity - section.assigned,
                      0,
                    ),
                  ],
                ]
              : [
                  ["Total Early Enrollees", d.total],
                  ["Academic", d.categories.ACADEMIC ?? 0],
                  ["TechPro", d.categories.TECHPRO ?? 0],
                  [
                    "Pending Verification",
                    d.statuses.FOR_DOCUMENT_VERIFICATION ?? 0,
                  ],
                  ["Pre-Enrolled", d.statuses.PRE_ENROLLED ?? 0],
                  ["Section Assigned", d.statuses.SECTION_ASSIGNED ?? 0],
                  ["Waiting for Section", d.unassigned],
                  [
                    "For LIS Registration",
                    d.statuses.FOR_LIS_REGISTRATION ?? 0,
                  ],
                  ["LIS Confirmed", d.lis.LIS_CONFIRMED ?? 0],
                ]
            ).map(([label, value]) => (
              <div className="panel" key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-2 font-display text-3xl">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="panel">
              <h2 className="mb-4 font-bold">Enrollment stages</h2>
              {Object.entries(d.statuses).map(([s, n]) => (
                <div key={s} className="mb-3">
                  <div className="flex justify-between text-sm">
                    <span>{readable(s)}</span>
                    <span>{n}</span>
                  </div>
                  <progress
                    max={Math.max(d.total, 1)}
                    value={n}
                    aria-label={readable(s)}
                    className="h-2 w-full accent-brand"
                  />
                </div>
              ))}
              {!d.total && <p>No submitted early enrollment records yet.</p>}
            </div>
            <div className="panel">
              <h2 className="mb-4 font-bold">Section utilization</h2>
              {d.sections.map((s) => (
                <div key={s.id} className="mb-3">
                  <div className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span>
                      {s.assigned}/{s.capacity}
                    </span>
                  </div>
                  <progress
                    max={s.capacity}
                    value={s.assigned}
                    aria-label={s.name}
                    className="h-2 w-full accent-brand"
                  />
                </div>
              ))}
              {!d.sections.length && <p>No sections to display.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
