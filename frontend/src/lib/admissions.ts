export type Learner = {
  id: string;
  owner: string | null;
  lrn: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  birthdate: string;
  age: number;
  sex: string;
  religion: string;
  ip_membership: string;
  address: string;
  contact_number: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  previous_school: string;
  previous_section: string;
};
export type Period = {
  id: number;
  name: string;
  opens_on: string;
  closes_on: string;
  is_active: boolean;
};
export type Program = {
  id: number;
  name: string;
  track: string;
  is_active: boolean;
};
export type Application = {
  id: string;
  reference: string;
  learner: string;
  learner_name: string;
  period_name: string;
  program_name: string | null;
  admission_period: number;
  grade_level: number;
  track: string;
  program: number | null;
  classification: string;
  source: string;
  status: "DRAFT" | "SUBMITTED";
  created_at: string;
  submitted_at: string | null;
};
export type Requirement = {
  id: number;
  name: string;
  is_required: boolean;
  uploaded: boolean;
  can_upload: boolean;
  review_status: ReviewStatus | "NOT_UPLOADED";
  latest_document: string | null;
};
export type Document = {
  id: string;
  application: string;
  requirement: number;
  requirement_name: string;
  original_filename: string;
  version: number;
  uploaded_at: string;
  sha256: string;
  file_size: number;
  review: DocumentReview | null;
  review_status: ReviewStatus;
  is_latest: boolean;
  application_reference: string;
  learner_name: string;
  period_name: string;
};

export type ReviewDecision = "VERIFIED" | "REJECTED" | "RESUBMISSION_REQUESTED";
export type ReviewStatus = ReviewDecision | "PENDING";
export interface DocumentReview {
  id: string;
  decision: ReviewDecision;
  remarks: string;
  reviewed_at: string;
  reviewer_name: string;
}
export interface ReviewQueue {
  count: number;
  next: string | null;
  previous: string | null;
  results: Document[];
}
