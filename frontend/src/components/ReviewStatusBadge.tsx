import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";
import type { ReviewStatus } from "../lib/admissions";
import { reviewLabels } from "../lib/reviews";
import { StatusBadge } from "./ui/StatusBadge";

export function ReviewStatusBadge({
  status,
}: {
  status: ReviewStatus | "NOT_UPLOADED";
}) {
  const Icon =
    status === "VERIFIED"
      ? CheckCircle2
      : status === "REJECTED"
        ? XCircle
        : status === "RESUBMISSION_REQUESTED"
          ? RotateCcw
          : Clock3;
  const tone =
    status === "VERIFIED"
      ? "success"
      : status === "REJECTED"
        ? "danger"
        : status === "RESUBMISSION_REQUESTED"
          ? "pending"
          : "neutral";
  return (
    <StatusBadge tone={tone}>
      <Icon size={12} aria-hidden="true" />
      {reviewLabels[status]}
    </StatusBadge>
  );
}
