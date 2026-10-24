import { SortableHeader } from "../components/SortableHeader";
import { Pagination } from "../components/Pagination";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorMessage, Field, Page } from "../components/Form";
import { EnrollmentFilters } from "../components/EnrollmentFilters";
import { LoadingState } from "../components/ui/LoadingState";
import { apiRequest, apiResponse } from "../lib/api";
const reports = {
  "early-enrollment": "Early Enrollment Master List",
  "by-track": "Enrollment by Track",
  "by-program": "Enrollment by Cluster / Strand",
  "by-section": "Enrollment by Section",
  "section-master": "Section Master List",
  "section-utilization": "Section Capacity / Utilization",
  unassigned: "Unassigned Learners",
  "pending-documents": "Pending Document Verification",
  "pre-enrolled": "Pre-Enrolled Learners",
  "for-lis": "Learners for LIS Registration",
  "lis-confirmed": "LIS Confirmed Learners",
  "status-summary": "Registration Status Summary",
  "blockchain-transactions": "Blockchain Transaction Report",
};
interface Report {
  title: string;
  generated_at: string;
  count: number;
  columns: string[];
  rows: Record<string, string | number>[];
}
export function ReportsPage() {
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("");
  const [report, setReport] = useState("early-enrollment");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams({
    ...filters,
    report,
    ...(ordering ? { ordering } : {}),
    page: String(page),
  });
  const query = useQuery({
    queryKey: ["report", report, filters, page, ordering],
    queryFn: () => apiRequest<Report>(`/enrollment-reports/?${params}`),
  });
  async function download(format: string) {
    setBusy(true);
    setError("");
    try {
      const response = await apiResponse(
        `/enrollment-reports/?${params}&export=${format}`,
      );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Enrollment & Transaction Reports">
      <EnrollmentFilters
        value={filters}
        onChange={(value) => {
          setFilters(value);
          setPage(1);
        }}
      />
      <div className="panel mb-5 flex flex-wrap items-end gap-4">
        <Field label="Report">
          <select
            value={report}
            onChange={(e) => {
              setReport(e.target.value);
              setOrdering("");
              setPage(1);
            }}
          >
            {Object.entries(reports).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section identifier (optional)">
          <input
            type="number"
            min={1}
            value={filters.section ?? ""}
            onChange={(e) => {
              setFilters({ ...filters, section: e.target.value });
              setPage(1);
            }}
          />
        </Field>
        <button
          className="action secondary"
          disabled={busy || !query.data}
          onClick={() => void download("csv")}
        >
          Export CSV
        </button>
        <button
          className="action secondary"
          disabled={busy || !query.data}
          onClick={() => void download("pdf")}
        >
          Export PDF
        </button>
      </div>
      <ErrorMessage error={query.error || error} />
      {query.isPending && <LoadingState label="Preparing report…" />}
      {query.data && (
        <section className="panel">
          <h2 className="font-bold">{query.data.title}</h2>
          <p className="mb-4 text-sm text-muted">
            {query.data.count} rows ·{" "}
            {new Date(query.data.generated_at).toLocaleString()}
          </p>
          {!query.data.count ? (
            <p>No records match these filters.</p>
          ) : (
            <div
              className="overflow-auto"
              tabIndex={0}
              role="region"
              aria-label="Report table"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {query.data.columns.map((c) =>
                      c === "Documents" ? (
                        <th key={c} scope="col" className="p-3">
                          {c}
                        </th>
                      ) : (
                        <SortableHeader
                          key={c}
                          label={c}
                          column={c}
                          ordering={ordering}
                          onSort={(value) => {
                            setOrdering(value);
                            setPage(1);
                          }}
                        />
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((row, i) => (
                    <tr key={i}>
                      {query.data!.columns.map((c) => (
                        <td className="border-b border-line p-3" key={c}>
                          {row[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            count={query.data.count}
            page={page}
            onChange={setPage}
            busy={query.isFetching}
          />
        </section>
      )}
    </Page>
  );
}
