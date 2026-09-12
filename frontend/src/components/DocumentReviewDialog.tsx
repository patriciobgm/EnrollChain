import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { apiRequest, jsonBody } from "../lib/api";
import type { Document, ReviewDecision } from "../lib/admissions";
import { downloadDocument } from "../lib/download";
import { ErrorMessage, Field } from "./Form";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/Dialog";

interface ReviewOption {
  value: ReviewDecision;
  label: string;
  description: string;
}
const options: readonly ReviewOption[] = [
  {
    value: "VERIFIED",
    label: "Verify document",
    description: "The reviewed version meets the document requirement.",
  },
  {
    value: "RESUBMISSION_REQUESTED",
    label: "Request a correction",
    description: "Allow a replacement PDF and explain what needs to change.",
  },
  {
    value: "REJECTED",
    label: "Reject document",
    description:
      "Record rejection of this version without enabling a replacement.",
  },
];

export function DocumentReviewDialog({
  document,
  onOpenChange,
}: {
  document: Document;
  onOpenChange?: (open: boolean) => void;
}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const completed = useRef(false);
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [remarks, setRemarks] = useState("");
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<Document>(
        `/documents/${document.id}/review/`,
        jsonBody({ decision, remarks: remarks.trim() }),
      ),
    onSuccess: async () => {
      completed.current = true;
      setOpen(false);
      onOpenChange?.(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["review-queue"] }),
        cache.invalidateQueries({
          queryKey: ["documents", document.application],
        }),
        cache.invalidateQueries({
          queryKey: ["requirements", document.application],
        }),
      ]);
    },
  });
  function changeOpen(value: boolean) {
    if (mutation.isPending) return;
    setOpen(value);
    onOpenChange?.(value);
    if (value) {
      completed.current = false;
      setDecision("");
      setRemarks("");
      setDownloadError(null);
      mutation.reset();
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (decision && (decision === "VERIFIED" || remarks.trim()))
      mutation.mutate();
  }
  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadDocument(document.id, document.original_filename);
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Review ${document.requirement_name} for ${document.learner_name}`}
        >
          <FileCheck2 aria-hidden="true" />
          Review document
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (completed.current) {
            event.preventDefault();
            window.document.getElementById("review-queue-heading")?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <DialogTitle>Review document</DialogTitle>
        <DialogDescription>
          {document.learner_name} · {document.requirement_name} · Version{" "}
          {document.version}. Your decision applies to this file version and is
          retained in the review history.
        </DialogDescription>
        <div className="my-5 rounded-2xl border border-line bg-canvas p-4">
          <p className="mb-3 break-all text-sm font-medium">
            {document.original_filename}
          </p>
          <Button
            variant="outline"
            onClick={() => void download()}
            disabled={downloading}
          >
            <Download aria-hidden="true" />
            {downloading ? "Downloading…" : "Download PDF to review"}
          </Button>
          <ErrorMessage error={downloadError} />
        </div>
        <form
          onSubmit={submit}
          className="space-y-5"
          aria-busy={mutation.isPending}
        >
          <fieldset disabled={mutation.isPending} className="space-y-2">
            <legend className="mb-3 text-sm font-bold">Review decision</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-xl border border-line p-3.5 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
              >
                <input
                  className="mt-1 size-4 accent-brand"
                  type="radio"
                  name="decision"
                  value={option.value}
                  checked={decision === option.value}
                  onChange={() => setDecision(option.value)}
                  required
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field
            label={decision === "VERIFIED" ? "Remarks (optional)" : "Remarks"}
            hint="Applicants can read these remarks. Describe the document issue and any correction needed; avoid unrelated sensitive information."
          >
            <textarea
              rows={4}
              maxLength={2000}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              required={decision !== "VERIFIED"}
              disabled={mutation.isPending}
            />
          </Field>
          <ErrorMessage error={mutation.error} />
          {mutation.isPending && (
            <p role="status" className="text-sm text-muted">
              Recording review decision…
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !decision ||
                (decision !== "VERIFIED" && !remarks.trim())
              }
            >
              {mutation.isPending ? "Recording…" : "Record decision"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
