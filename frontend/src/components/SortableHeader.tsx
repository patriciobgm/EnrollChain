import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
export function SortableHeader({
  label,
  column,
  ordering,
  onSort,
}: {
  label: string;
  column: string;
  ordering: string;
  onSort: (value: string) => void;
}) {
  const active = ordering.replace(/^-/, "") === column;
  const descending = ordering.startsWith("-");
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <th
      scope="col"
      className="p-3 text-left"
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="group inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-semibold"
        onClick={() => onSort(active && !descending ? `-${column}` : column)}
      >
        {label}
        <Icon
          size={14}
          aria-hidden="true"
          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    </th>
  );
}
