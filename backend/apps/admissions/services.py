import hashlib
from pathlib import PurePosixPath

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import record_audit_event

from .models import (
    Application,
    DocumentReview,
    DocumentSubmission,
    Learner,
    Requirement,
    RequirementRule,
)
from .permissions import staff_can

MAX_PDF_SIZE = 30 * 1024 * 1024
DEFAULT_REQUIREMENTS = (
    "Report Card / SF9",
    "Good Moral Certificate",
    "Birth Certificate",
    "Elementary Record / SF10",
)


def audit(instance, action, request):
    record_audit_event(
        action=action,
        entity=type(instance).__name__,
        entity_id=instance.pk,
        user=request.user,
        request=request,
    )


def seed_period_requirements(period):
    for name in DEFAULT_REQUIREMENTS:
        requirement, _ = Requirement.objects.get_or_create(name=name)
        for classification in ["NEW", "TRANSFEREE"]:
            RequirementRule.objects.get_or_create(
                requirement=requirement,
                admission_period=period,
                classification=classification,
                grade_level=None,
                track="",
                program=None,
            )


def applicable_rules(application):
    return (
        RequirementRule.objects.filter(
            admission_period=application.admission_period,
            classification=application.classification,
        )
        .filter(Q(grade_level__isnull=True) | Q(grade_level=application.grade_level))
        .filter(Q(track="") | Q(track=application.track))
        .filter(Q(program__isnull=True) | Q(program=application.program))
        .select_related("requirement")
    )


def document_review_status(document):
    review = getattr(document, "review", None)
    return review.decision if review else "PENDING"


def can_replace_document(application, document):
    return application.status == Application.Status.DRAFT or (
        application.status == Application.Status.SUBMITTED
        and document is not None
        and document_review_status(document) == DocumentReview.Decision.RESUBMISSION_REQUESTED
    )


def checklist(application):
    result = {}
    latest = {}
    for document in application.documents.select_related("review").order_by("-version"):
        latest.setdefault(document.requirement_id, document)
    for rule in applicable_rules(application):
        document = latest.get(rule.requirement_id)
        entry = result.setdefault(
            rule.requirement_id,
            {
                "id": rule.requirement_id,
                "name": rule.requirement.name,
                "is_required": False,
                "uploaded": document is not None,
                "review_status": document_review_status(document) if document else "NOT_UPLOADED",
                "can_upload": can_replace_document(application, document),
                "latest_document": str(document.pk) if document else None,
            },
        )
        entry["is_required"] |= rule.is_required
    return list(result.values())


def ensure_draft(application):
    if application.status != Application.Status.DRAFT:
        raise ValidationError("Submitted applications are read-only in this milestone.")


def validate_application_configuration(application):
    period = application.admission_period
    if not period.is_active:
        raise ValidationError({"admission_period": "This admission period is inactive."})
    if application.program and (
        application.program.track != application.track or not application.program.is_active
    ):
        raise ValidationError({"program": "Select an active program matching the track."})
    if application.source == Application.Source.LATE:
        raise ValidationError({"source": "Late-registration authorization is not configured yet."})


@transaction.atomic
def submit_application(application, request):
    application = Application.objects.select_for_update().get(pk=application.pk)
    Learner.objects.select_for_update().get(pk=application.learner_id)
    ensure_draft(application)
    validate_application_configuration(application)
    today = timezone.localdate()
    if not application.admission_period.opens_on <= today <= application.admission_period.closes_on:
        raise ValidationError({"admission_period": "The admission period is not open."})
    missing = [r["name"] for r in checklist(application) if r["is_required"] and not r["uploaded"]]
    if missing:
        raise ValidationError({"requirements": missing})
    application.status = Application.Status.SUBMITTED
    application.submitted_at = timezone.now()
    application.save(update_fields=["status", "submitted_at", "updated_at"])
    audit(application, "SUBMIT_APPLICATION", request)
    return application


def validate_pdf(upload):
    if upload.size > MAX_PDF_SIZE:
        raise ValidationError({"file": "PDF must be at most 30 MB (31,457,280 bytes)."})
    if not upload.name.lower().endswith(".pdf") or upload.content_type != "application/pdf":
        raise ValidationError(
            {"file": "Only PDF files with MIME type application/pdf are accepted."}
        )
    digest = hashlib.sha256()
    size = 0
    for chunk in upload.chunks():
        size += len(chunk)
        if size > MAX_PDF_SIZE:
            raise ValidationError({"file": "PDF exceeds the 30 MB limit."})
        digest.update(chunk)
    upload.seek(0)
    if upload.read(5) != b"%PDF-":
        raise ValidationError({"file": "The file is not a PDF."})
    upload.seek(0)
    try:
        reader = PdfReader(upload, strict=True)
        if reader.is_encrypted or not len(reader.pages):
            raise ValueError("Encrypted or empty PDF")
    except Exception as exc:
        raise ValidationError({"file": "Upload a readable, unencrypted PDF."}) from exc
    finally:
        upload.seek(0)
    return digest.hexdigest(), size


def upload_document(*, application, requirement, upload, request):
    digest, size = validate_pdf(upload)
    document = None
    try:
        with transaction.atomic():
            application = Application.objects.select_for_update().get(pk=application.pk)
            latest = (
                application.documents.filter(requirement=requirement)
                .select_related("review")
                .order_by("-version")
                .first()
            )
            if not can_replace_document(application, latest):
                raise ValidationError("Only documents flagged for resubmission may be replaced.")
            if not applicable_rules(application).filter(requirement=requirement).exists():
                raise ValidationError(
                    {"requirement": "Requirement does not apply to this application."}
                )
            version = (
                application.documents.filter(requirement=requirement).aggregate(
                    latest=Max("version")
                )["latest"]
                or 0
            ) + 1
            document = DocumentSubmission(
                application=application,
                requirement=requirement,
                file=upload,
                original_filename=PurePosixPath(upload.name.replace("\\", "/")).name,
                file_size=size,
                sha256=digest,
                version=version,
                uploaded_by=request.user,
            )
            document.save()
            audit(
                document,
                "RESUBMIT_DOCUMENT"
                if latest and application.status == "SUBMITTED"
                else "UPLOAD_DOCUMENT",
                request,
            )
        return document
    except Exception:
        if document is not None and document.file and document.file._committed:
            document.file.delete(save=False)
        raise


@transaction.atomic
def review_document(*, document, decision, remarks, request):
    user = request.user
    if user.role != "REGISTRAR" or not staff_can(user, "review_document"):
        raise PermissionDenied("Only an authorized registrar can decide a document review.")
    application = Application.objects.select_for_update().get(pk=document.application_id)
    document = DocumentSubmission.objects.select_related("review").get(pk=document.pk)
    if application.status != Application.Status.SUBMITTED:
        raise ValidationError("Only submitted applications can be reviewed.")
    if application.documents.filter(
        requirement=document.requirement, version__gt=document.version
    ).exists():
        raise ValidationError("A newer document version exists. Refresh the review queue.")
    if getattr(document, "review", None) is not None:
        raise ValidationError(
            "This version already has a review decision. Refresh the review queue."
        )
    if decision not in DocumentReview.Decision.values:
        raise ValidationError({"decision": "Choose a supported review decision."})
    remarks = remarks.strip()
    if decision != DocumentReview.Decision.VERIFIED and not remarks:
        raise ValidationError({"remarks": "Explain the rejection or correction needed."})
    if len(remarks) > 2000:
        raise ValidationError({"remarks": "Use at most 2000 characters."})
    review = DocumentReview.objects.create(
        document=document, decision=decision, remarks=remarks, reviewed_by=user
    )
    audit(review, "REVIEW_DOCUMENT", request)
    return review
