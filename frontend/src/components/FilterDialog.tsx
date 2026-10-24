import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/Dialog";

export function FilterDialog({
  value,
  onApply,
  children,
}: {
  value: Record<string, string>;
  onApply: (value: Record<string, string>) => void;
  children: (
    draft: Record<string, string>,
    change: (value: Record<string, string>) => void,
  ) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const count = Object.values(value).filter(Boolean).length;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setDraft(value);
          setOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" className="px-3">
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {count > 0 && (
              <span className="rounded-full bg-brand-soft px-2 text-xs text-brand">
                {count}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Filters</DialogTitle>
          <DialogDescription className="sr-only">
            Choose filters and apply them to the results.
          </DialogDescription>
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              onApply(draft);
              setOpen(false);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {children(draft, setDraft)}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setDraft({})}>
                Reset
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Apply Filters</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {count > 0 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear Filters"
          onClick={() => onApply({})}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
