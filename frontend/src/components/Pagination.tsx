import { Button } from "./ui/Button";
export function Pagination({
  count,
  page,
  onChange,
  busy = false,
  pageSize = 20,
}: {
  count: number;
  page: number;
  onChange: (page: number) => void;
  busy?: boolean;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <nav
      aria-label="Pagination"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <span role="status">
        {count
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`
          : "0 records"}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={busy || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          disabled={busy || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
