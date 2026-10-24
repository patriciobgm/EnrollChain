import { FilterDialog } from "./FilterDialog";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import {
  readable,
  type Program,
  type TrackConfiguration,
} from "../lib/admissions";
import { Field } from "./Form";
export function EnrollmentFilters({
  value,
  onChange,
  includeSection = false,
}: {
  includeSection?: boolean;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  const years = useQuery({
    queryKey: ["school-years"],
    queryFn: () => apiRequest<{ id: number; name: string }[]>("/school-years/"),
  });
  const tracks = useQuery({
    queryKey: ["tracks"],
    queryFn: () => apiRequest<TrackConfiguration[]>("/tracks/"),
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => apiRequest<Program[]>("/programs/"),
  });
  const choices: [string, string, { value: string; label: string }[]][] = [
    [
      "classification",
      "Learner Classification",
      ["NEW", "RETURNING", "TRANSFEREE"].map((value) => ({
        value,
        label: readable(value),
      })),
    ],
    [
      "school_year",
      "School year",
      years.data?.map((y) => ({ value: String(y.id), label: y.name })) ?? [],
    ],
    [
      "grade_level",
      "Grade",
      [11, 12].map((g) => ({ value: String(g), label: `Grade ${g}` })),
    ],
    [
      "track",
      "Track",
      tracks.data?.map((t) => ({ value: t.code, label: t.name })) ?? [],
    ],
    [
      "program",
      "Cluster / strand",
      programs.data?.map((p) => ({ value: String(p.id), label: p.name })) ?? [],
    ],
    [
      "status",
      "Enrollment status",
      [
        "FOR_DOCUMENT_VERIFICATION",
        "FOR_RESUBMISSION",
        "FOR_EVALUATION",
        "QUALIFIED",
        "NOT_QUALIFIED",
        "PRE_ENROLLED",
        "SECTION_ASSIGNED",
        "FOR_LIS_REGISTRATION",
        "OFFICIALLY_ENROLLED",
        "REJECTED",
      ].map((s) => ({ value: s, label: readable(s) })),
    ],
    [
      "lis_status",
      "LIS status",
      [
        "NOT_READY",
        "READY_FOR_LIS",
        "SUBMITTED_TO_LIS",
        "LIS_CONFIRMED",
        "LIS_REJECTED",
      ].map((s) => ({ value: s, label: readable(s) })),
    ],
  ];
  return (
    <FilterDialog value={value} onApply={onChange}>
      {(draft, change) => (
        <>
          {choices.map(([key, label, options]) => (
            <Field key={key} label={label}>
              <select
                value={draft[key] ?? ""}
                onChange={(e) =>
                  change({
                    ...draft,
                    [key]: e.target.value,
                    ...(key === "track" ? { program: "" } : {}),
                  })
                }
              >
                <option value="">All</option>
                {options
                  .filter(
                    (o) =>
                      key !== "program" ||
                      !draft.track ||
                      programs.data?.find((p) => String(p.id) === o.value)
                        ?.track === draft.track,
                  )
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
          {includeSection && (
            <Field label="Section Identifier">
              <input
                type="number"
                min={1}
                value={draft.section ?? ""}
                onChange={(e) => change({ ...draft, section: e.target.value })}
              />
            </Field>
          )}
        </>
      )}
    </FilterDialog>
  );
}
