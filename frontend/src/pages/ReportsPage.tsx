import { readable } from "../lib/admissions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";
import { Button } from "../components/ui/Button";
import { MoreHorizontal } from "lucide-react";
import { SortableHeader } from "../components/SortableHeader";
import { Pagination } from "../components/Pagination";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
function displayValue(label: string, value: string | number) {
  return typeof value === "string" &&
    ["Event", "Status", "Enrollment status", "LIS status"].includes(label)
    ? readable(value)
    : value;
}
interface Report {
  title: string;
  generated_at: string;
  count: number;
  columns: string[];
  rows: Record<string, string | number>[];
}
export function ReportsPage() {
  const detailTrigger = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<
    string,
    string | number
  > | null>(null);
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
  const columns = query.data?.columns ?? [];
  const primary =
    ["Learner", "Section", "Event", "Track", "Program", "Reference"].find((c) =>
      columns.includes(c),
    ) ?? columns[0];
  const secondary =
    ["Enrollment status", "Status", "Available", "Learners"].find((c) =>
      columns.includes(c),
    ) ?? columns[1];
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
      <div className="mb-5 flex flex-wrap items-end gap-2 [&>.field]:min-w-0 [&>.field]:flex-1 [&>.field]:basis-full sm:[&>.field]:basis-64">
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
        <EnrollmentFilters
          includeSection
          value={filters}
          onChange={(value) => {
            setFilters(value);
            setPage(1);
          }}
        />
        <button
          className="action secondary px-2"
          disabled={busy || !query.data}
          aria-label="Export CSV"
          onClick={() => void download("csv")}
        >
          CSV
        </button>
        <button
          className="action secondary px-2"
          disabled={busy || !query.data}
          aria-label="Export PDF"
          onClick={() => void download("pdf")}
        >
          PDF
        </button>
      </div>
      <ErrorMessage error={query.error || error} />
      {query.isPending && <LoadingState label="Preparing report…" />}
      {query.data && (
        <section className="panel">
          <h2 className="font-bold">{query.data.title}</h2>
          <p className="mb-4 text-sm text-muted">
            {query.data.count} {query.data.count === 1 ? "row" : "rows"} ·{" "}
            {new Date(query.data.generated_at).toLocaleString()}
          </p>
          {!query.data.count ? (
            <p>No records match these filters.</p>
          ) : (
            <div
              className="result-table"
              tabIndex={0}
              role="region"
              aria-label="Report table"
            >
              <table
                className={`w-full text-left text-sm ${columns.length > 4 ? "hidden sm:table" : ""}`}
              >
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
                          {displayValue(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {columns.length > 4 && (
                <table
                  className="report-summary table-fixed sm:hidden"
                  aria-label="Report Summary"
                >
                  <thead>
                    <tr>
                      {[primary, secondary].map((column) => (
                        <SortableHeader
                          key={column}
                          label={
                            column === "Enrollment status" ||
                            column === "LIS status"
                              ? "Status"
                              : column
                          }
                          className="[&_button]:whitespace-normal [&_button]:gap-1 [&_button]:text-xs"
                          column={column}
                          ordering={ordering}
                          onSort={(value) => {
                            setOrdering(value);
                            setPage(1);
                          }}
                        />
                      ))}
                      <th scope="col" className="w-14">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.rows.map((row, index) => (
                      <tr key={index}>
                        <td className="break-words font-medium">
                          {displayValue(primary, row[primary])}
                        </td>
                        <td className="break-words">
                          {displayValue(secondary, row[secondary])}
                        </td>
                        <td className="px-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`View report row ${index + 1}`}
                            onClick={(event) => {
                              detailTrigger.current = event.currentTarget;
                              setSelected(row);
                            }}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailTrigger.current?.focus();
          }}
        >
          <DialogTitle>Report Details</DialogTitle>
          <DialogDescription>{query.data?.title}</DialogDescription>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {selected &&
              Object.entries(selected).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-muted">{label}</dt>
                  <dd className="mt-1 break-words text-sm">
                    {displayValue(label, value) || "—"}
                  </dd>
                </div>
              ))}
          </dl>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
