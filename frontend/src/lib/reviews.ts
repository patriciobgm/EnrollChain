import type { User } from "./auth";
import type { ReviewStatus } from "./admissions";

export const reviewLabels: Record<ReviewStatus | "NOT_UPLOADED", string> = {
  PENDING: "Awaiting review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  RESUBMISSION_REQUESTED: "Correction requested",
  NOT_UPLOADED: "Not uploaded",
};
export function canViewReviews(user: User | null): boolean {
  return (
    !!user &&
    ["REGISTRAR", "ADMINISTRATOR"].includes(user.role) &&
    user.permissions.includes("admissions.view_documentsubmission") &&
    user.permissions.includes("admissions.view_documentreview")
  );
}
export function canDecideReviews(user: User | null): boolean {
  return (
    user?.role === "REGISTRAR" &&
    user.permissions.includes("admissions.review_document") &&
    user.permissions.includes("admissions.view_documentsubmission")
  );
}
