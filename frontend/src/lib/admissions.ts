export type Learner = {
  id: string;
  owner: string | null;
  owner_email?: string | null;
  lrn: string | null;
  email?: string | null;
  last_grade_completed?: number | null;
  school_year_completed?: string;
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
  enrollment_status?: string;
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
  validation_flags?: string[];
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

export interface TrackConfiguration {
  code: string;
  name: string;
  category: "ACADEMIC" | "TECHPRO";
  default_section_capacity: number;
  active: boolean;
}
export interface Section {
  id: number;
  code: string;
  name: string;
  school_year: number;
  track: string;
  track_name: string;
  program: number;
  program_name: string;
  grade_level: number;
  capacity: number;
  current_count: number;
  available_slots: number;
  utilization: number;
  status: string;
  active: boolean;
  adviser: string | null;
}
export interface Enrollment extends Application {
  school_year: number;
  enrollment_status: string;
  track_name: string;
  learner_lrn: string | null;
  learner_sex: string;
  guidance_completed: boolean;
  eligibility: {
    ready: boolean;
    profile_missing: string[];
    pending_requirements: string[];
    guidance_completed: boolean;
    track_and_program_valid: boolean;
  };
  section_assignment: {
    id: number;
    section: number;
    section_name: string;
    section_code: string;
    assigned_at: string;
  } | null;
  lis_record: {
    status: string;
    reference: string;
    submission_date: string | null;
    confirmation_date: string | null;
    remarks: string;
  } | null;
  enrollment_events: {
    id: number;
    action: string;
    old_status: string;
    new_status: string;
    remarks: string;
    created_at: string;
    actor_role: string;
  }[];
}
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export const readable = (value: string) =>
  value === "RETURNING"
    ? "Balik-Aral"
    : value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (letter) => letter.toUpperCase());
