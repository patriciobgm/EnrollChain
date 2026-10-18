"""School workflow and deterministic, serialized section allocation."""

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import (
    Application,
    EnrollmentEvent,
    GuidanceInterview,
    LisRecord,
    SchoolYear,
    Section,
    SectionAssignment,
    TrackConfiguration,
)
from .permissions import staff_can
from .services import audit, checklist

FINAL_STAGES = {
    "QUALIFIED",
    "PRE_ENROLLED",
    "SECTION_ASSIGNED",
    "FOR_LIS_REGISTRATION",
    "LIS_CONFIRMED",
    "OFFICIALLY_ENROLLED",
    "REJECTED",
    "NOT_QUALIFIED",
}
PRE_STAGES = {"PRE_ENROLLED", "SECTION_ASSIGNED", "FOR_LIS_REGISTRATION"}


def authorize(request, roles, permission):
    if request.user.role not in roles or not staff_can(request.user, permission):
        raise PermissionDenied("Your role does not have permission for this workflow action.")


def event(application, action, request, new_status=None, remarks="", metadata=None):
    old = application.enrollment_status
    if new_status is not None:
        application.enrollment_status = new_status
        application.save(update_fields=["enrollment_status", "updated_at"])
    row = EnrollmentEvent.objects.create(
        application=application,
        actor=request.user,
        action=action,
        old_status=old,
        new_status=application.enrollment_status,
        remarks=remarks,
        metadata=metadata or {},
    )
    audit(
        application,
        action,
        request,
        {
            "old_status": old,
            "new_status": application.enrollment_status,
            "event_id": row.pk,
            **(metadata or {}),
        },
    )
    return row


def refresh_document_stage(application, request):
    if application.status != "SUBMITTED" or application.enrollment_status in FINAL_STAGES:
        return
    entries = [item for item in checklist(application) if item["is_required"]]
    if any(item["review_status"] in {"REJECTED", "RESUBMISSION_REQUESTED"} for item in entries):
        stage = "FOR_RESUBMISSION"
    elif all(item["review_status"] == "VERIFIED" for item in entries):
        stage = "FOR_EVALUATION"
    else:
        stage = "FOR_DOCUMENT_VERIFICATION"
    if stage != application.enrollment_status:
        event(application, "DOCUMENT_PROGRESS_UPDATED", request, stage)


def profile_missing(learner):
    fields = [
        "first_name",
        "last_name",
        "birthdate",
        "sex",
        "address",
        "contact_number",
        "previous_school",
        "last_grade_completed",
        "school_year_completed",
    ]
    return [field for field in fields if not getattr(learner, field)]


def eligibility(application):
    checks = checklist(application)
    missing = profile_missing(application.learner)
    pending = [
        item["name"]
        for item in checks
        if item["is_required"] and item["review_status"] != "VERIFIED"
    ]
    interview = GuidanceInterview.objects.filter(application=application).exists()
    track = TrackConfiguration.objects.filter(code=application.track, active=True).exists()
    program = bool(
        application.program_id
        and application.program.is_active
        and application.program.track == application.track
    )
    ready = (
        application.status == "SUBMITTED"
        and not missing
        and not pending
        and interview
        and track
        and program
    )
    return {
        "ready": ready,
        "profile_missing": missing,
        "pending_requirements": pending,
        "guidance_completed": interview,
        "track_and_program_valid": track and program,
    }


@transaction.atomic
def complete_interview(application, request, remarks):
    authorize(request, {"GUIDANCE_OFFICER"}, "complete_interview")
    application = Application.objects.select_for_update().get(pk=application.pk)
    if application.status != "SUBMITTED" or application.enrollment_status in FINAL_STAGES:
        raise ValidationError(
            "Interview completion requires a submitted application awaiting evaluation."
        )
    if GuidanceInterview.objects.filter(application=application).exists():
        raise ValidationError("This interview is already recorded.")
    GuidanceInterview.objects.create(
        application=application, officer=request.user, remarks=remarks.strip()
    )
    # Guidance notes remain private to staff; only completion is shown in applicant history.
    event(application, "GUIDANCE_INTERVIEW_COMPLETED", request)
    return application


@transaction.atomic
def evaluate(application, request, decision, remarks):
    authorize(request, {"REGISTRAR"}, "evaluate_application")
    application = (
        Application.objects.select_for_update(of=("self", "learner"))
        .select_related("learner", "program")
        .get(pk=application.pk)
    )
    if application.status != "SUBMITTED" or application.enrollment_status in {
        "PRE_ENROLLED",
        "SECTION_ASSIGNED",
        "FOR_LIS_REGISTRATION",
        "LIS_CONFIRMED",
        "OFFICIALLY_ENROLLED",
        "REJECTED",
    }:
        raise ValidationError("This application is not available for evaluation.")
    if decision not in {"QUALIFIED", "NOT_QUALIFIED", "REJECTED"}:
        raise ValidationError("Choose a supported evaluation decision.")
    if decision != "QUALIFIED" and not remarks.strip():
        raise ValidationError({"remarks": "Explain the decision."})
    result = eligibility(application)
    if decision == "QUALIFIED" and not result["ready"]:
        raise ValidationError({"eligibility": result})
    if decision == "QUALIFIED":
        application.qualification_snapshot = {
            "requirements": checklist(application),
            "interview_id": application.guidance_interview.pk,
        }
        application.save(update_fields=["qualification_snapshot"])
    event(application, "LEARNER_" + decision, request, decision, remarks)
    return application


@transaction.atomic
def confirm_pre_enrollment(application, request, remarks=""):
    authorize(request, {"REGISTRAR"}, "confirm_preenrollment")
    SchoolYear.objects.select_for_update().get(pk=application.admission_period.school_year_id)
    application = (
        Application.objects.select_for_update(of=("self", "learner"))
        .select_related("learner", "program")
        .get(pk=application.pk)
    )
    if application.enrollment_status != "QUALIFIED" or not eligibility(application)["ready"]:
        raise ValidationError(
            "Qualification, verified requirements and a completed guidance interview are required."
        )
    application.pre_enrolled_at = timezone.now()
    application.save(update_fields=["pre_enrolled_at"])
    event(application, "PRE_ENROLLMENT_CONFIRMED", request, "PRE_ENROLLED", remarks)
    from apps.blockchain_records.services import enqueue_event

    enqueue_event(application, "PRE_ENROLLMENT_CONFIRMED", application.qualification_snapshot)
    # Use the same allocation service; it serializes every assignment for the school year.
    assign_section(application, request, automatic=True)
    application.refresh_from_db()
    return application


@transaction.atomic
def assign_section(
    application, request, *, section_id=None, automatic=False, remove=False, remarks=""
):
    authorize(request, {"REGISTRAR", "ADMINISTRATOR"}, "manage_sections")
    # All assignment / transfer / capacity writes acquire this same lock first.
    # A year lock also serializes candidates when two requests select different sections.
    year_id = application.admission_period.school_year_id
    SchoolYear.objects.select_for_update().get(pk=year_id)
    application = (
        Application.objects.select_for_update(of=("self", "learner"))
        .select_related("learner", "program", "admission_period")
        .get(pk=application.pk)
    )
    if application.enrollment_status not in PRE_STAGES:
        raise ValidationError(
            "Section assignment requires pre-enrollment and cannot change "
            "after LIS submission/confirmation."
        )
    lis = getattr(application, "lis_record", None)
    if lis and lis.status in {"SUBMITTED_TO_LIS", "LIS_CONFIRMED"}:
        raise ValidationError("Reconcile the LIS record before changing its section.")
    if not automatic and not remarks.strip():
        raise ValidationError({"remarks": "Explain the assignment, transfer or removal."})
    current = SectionAssignment.objects.select_for_update().filter(application=application).first()
    if automatic and current:
        return current
    other = SectionAssignment.objects.filter(
        learner=application.learner, school_year_id=year_id
    ).exclude(application=application)
    if other.exists():
        raise ValidationError("This learner already has a section assignment for this school year.")
    old = current.section_id if current else None
    if remove:
        if not current:
            raise ValidationError("This learner has no assigned section.")
        current.delete()
        if lis:
            lis.status = "NOT_READY"
            lis.save(update_fields=["status", "updated_at"])
        event(
            application,
            "SECTION_REMOVED",
            request,
            "PRE_ENROLLED",
            remarks,
            {"old_section": old, "new_section": None},
        )
        return None
    if not eligibility(application)["ready"]:
        raise ValidationError(
            "Profile, active track/program, verified requirements "
            "and guidance completion are required."
        )
    matching = Section.objects.filter(
        school_year_id=year_id,
        grade_level=application.grade_level,
        track_id=application.track,
        program_id=application.program_id,
        active=True,
    )
    # Lock stable rows in deterministic order, then compute counts under the year lock.
    sections = list(matching.select_for_update().order_by("pk"))
    counts = dict(
        SectionAssignment.objects.filter(section__in=sections)
        .values("section_id")
        .annotate(total=Count("pk"))
        .values_list("section_id", "total")
    )
    if section_id is not None:
        candidates = [section for section in sections if section.pk == section_id]
        if not candidates:
            raise ValidationError(
                "Section must match school year, grade, track and program and be active."
            )
    else:
        candidates = sorted(
            sections, key=lambda section: (counts.get(section.pk, 0), section.code, section.pk)
        )
    target = next(
        (
            section
            for section in candidates
            if section.pk == old or counts.get(section.pk, 0) < section.capacity
        ),
        None,
    )
    if target is None:
        if section_id is not None:
            raise ValidationError("The selected section is full.")
        event(application, "NO_AVAILABLE_SECTION", request, "PRE_ENROLLED")
        return None
    if old == target.pk:
        return current
    if current:
        current.section = target
        current.assigned_by = request.user
        current.assigned_at = timezone.now()
        current.save(update_fields=["section", "assigned_by", "assigned_at"])
    else:
        current = SectionAssignment.objects.create(
            application=application,
            learner=application.learner,
            school_year_id=year_id,
            section=target,
            assigned_by=request.user,
        )
    if lis:
        lis.status = "NOT_READY"
        lis.save(update_fields=["status", "updated_at"])
    event(
        application,
        "SECTION_AUTO_ASSIGNED"
        if automatic
        else "SECTION_TRANSFERRED"
        if old
        else "SECTION_MANUALLY_ASSIGNED",
        request,
        "SECTION_ASSIGNED",
        remarks,
        {"old_section": old, "new_section": target.pk},
    )
    return current


class LisIntegrationService:
    """Manual reconciliation only; no DepEd LIS network calls or invented connector."""

    @staticmethod
    @transaction.atomic
    def transition(application, request, action, reference="", remarks=""):
        authorize(request, {"REGISTRAR", "ADMINISTRATOR"}, "manage_lis")
        application = Application.objects.select_for_update().get(pk=application.pk)
        record, _ = LisRecord.objects.get_or_create(application=application)
        transitions = {
            "prepare": ({"NOT_READY", "LIS_REJECTED"}, "READY_FOR_LIS"),
            "submit": ({"READY_FOR_LIS"}, "SUBMITTED_TO_LIS"),
            "confirm": ({"SUBMITTED_TO_LIS"}, "LIS_CONFIRMED"),
            "reject": ({"SUBMITTED_TO_LIS"}, "LIS_REJECTED"),
        }
        if action not in transitions or record.status not in transitions[action][0]:
            raise ValidationError("Invalid LIS status transition.")
        if (
            application.enrollment_status not in {"SECTION_ASSIGNED", "FOR_LIS_REGISTRATION"}
            or not SectionAssignment.objects.filter(application=application).exists()
        ):
            raise ValidationError(
                "An eligible pre-enrolled learner must have an assigned section first."
            )
        if not eligibility(application)["ready"]:
            raise ValidationError("Current mandatory requirements are not satisfied.")
        if action in {"confirm", "reject"} and not remarks.strip():
            raise ValidationError(
                {"remarks": "Record the basis/evidence for manual LIS confirmation or rejection."}
            )
        old = record.status
        record.status = transitions[action][1]
        record.reference = reference.strip() or record.reference
        record.remarks = remarks.strip()
        if action == "submit":
            record.submission_date = timezone.now()
        if action == "confirm":
            record.confirmation_date = timezone.now()
            record.confirmed_by = request.user
        record.save()
        event(
            application,
            "LIS_" + action.upper(),
            request,
            "LIS_CONFIRMED" if action == "confirm" else "FOR_LIS_REGISTRATION",
            remarks,
            {"old_lis_status": old, "new_lis_status": record.status},
        )
        if action == "confirm":
            application.officially_enrolled_at = timezone.now()
            application.save(update_fields=["officially_enrolled_at"])
            event(
                application,
                "OFFICIAL_ENROLLMENT_CONFIRMED",
                request,
                "OFFICIALLY_ENROLLED",
                remarks,
            )
            from apps.blockchain_records.services import enqueue_event

            enqueue_event(
                application,
                "REGISTRATION_RECORDED",
                {
                    "application": str(application.pk),
                    "confirmed_at": record.confirmation_date.isoformat(),
                },
            )
        return record
