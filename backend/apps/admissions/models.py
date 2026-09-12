import uuid

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.common.storage import PrivateMediaStorage


class Track(models.TextChoices):
    ACADEMIC = "ACADEMIC", "Academic"
    TECHNICAL_PROFESSIONAL = "TECHNICAL_PROFESSIONAL", "Technical Professional"


class Classification(models.TextChoices):
    NEW = "NEW", "New"
    TRANSFEREE = "TRANSFEREE", "Transferee"
    RETURNING = "RETURNING", "Returning"


GRADES = [(11, "Grade 11"), (12, "Grade 12")]


class Timestamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SchoolYear(Timestamped):
    name = models.CharField(max_length=60, unique=True)
    starts_on = models.DateField()
    ends_on = models.DateField()

    class Meta:
        ordering = ["-starts_on"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__gte=models.F("starts_on")), name="school_year_dates"
            )
        ]

    def __str__(self):
        return self.name


class AdmissionPeriod(Timestamped):
    school_year = models.ForeignKey(SchoolYear, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    opens_on = models.DateField()
    closes_on = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-opens_on"]
        constraints = [
            models.UniqueConstraint(fields=["school_year", "name"], name="period_name_year"),
            models.CheckConstraint(
                condition=models.Q(closes_on__gte=models.F("opens_on")), name="period_dates"
            ),
        ]

    def __str__(self):
        return self.name


class Program(Timestamped):
    name = models.CharField(max_length=150)
    track = models.CharField(max_length=24, choices=Track.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["name", "track"], name="program_name_track"),
            models.CheckConstraint(
                condition=models.Q(track__in=Track.values), name="program_track"
            ),
        ]

    def __str__(self):
        return self.name


class Learner(Timestamped):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="learners",
    )
    lrn = models.CharField(
        max_length=12,
        unique=True,
        validators=[RegexValidator(r"^[0-9]{12}$", "LRN must contain exactly 12 digits.")],
    )
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=30, blank=True)
    birthdate = models.DateField()
    sex = models.CharField(max_length=40)
    religion = models.CharField(max_length=120, blank=True)
    ip_membership = models.CharField(max_length=150, blank=True)
    address = models.TextField()
    contact_number = models.CharField(max_length=30)
    father_name = models.CharField(max_length=200, blank=True)
    mother_maiden_name = models.CharField(max_length=200, blank=True)
    guardian_name = models.CharField(max_length=200, blank=True)
    previous_school = models.CharField(max_length=200, blank=True)
    previous_section = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def age(self) -> int:
        today = timezone.localdate()
        return (
            today.year
            - self.birthdate.year
            - ((today.month, today.day) < (self.birthdate.month, self.birthdate.day))
        )


def application_reference():
    return f"APP-{uuid.uuid4().hex.upper()}"


class Application(Timestamped):
    class Source(models.TextChoices):
        ONLINE = "ONLINE", "Online"
        WALK_IN = "WALK_IN", "Walk-in"
        LATE = "LATE", "Late"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(
        max_length=40, default=application_reference, unique=True, editable=False
    )
    learner = models.ForeignKey(Learner, on_delete=models.PROTECT, related_name="applications")
    admission_period = models.ForeignKey(AdmissionPeriod, on_delete=models.PROTECT)
    grade_level = models.PositiveSmallIntegerField(choices=GRADES)
    track = models.CharField(max_length=24, choices=Track.choices)
    program = models.ForeignKey(Program, null=True, blank=True, on_delete=models.PROTECT)
    classification = models.CharField(max_length=12, choices=Classification.choices)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.ONLINE)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [("submit_application", "Can submit an application")]
        constraints = [
            models.UniqueConstraint(
                fields=["learner", "admission_period"], name="one_learner_application_per_period"
            ),
            models.CheckConstraint(
                condition=models.Q(grade_level__in=[11, 12]), name="application_shs_grade"
            ),
            models.CheckConstraint(
                condition=models.Q(track__in=Track.values), name="application_track"
            ),
            models.CheckConstraint(
                condition=models.Q(classification__in=Classification.values),
                name="application_classification",
            ),
            models.CheckConstraint(
                condition=models.Q(source__in=["ONLINE", "WALK_IN", "LATE"]),
                name="application_source",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="DRAFT", submitted_at__isnull=True)
                    | models.Q(status="SUBMITTED", submitted_at__isnull=False)
                ),
                name="application_submission_state",
            ),
        ]

    def __str__(self):
        return self.reference


class Requirement(Timestamped):
    name = models.CharField(max_length=150, unique=True)

    def __str__(self):
        return self.name


class RequirementRule(Timestamped):
    requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT)
    admission_period = models.ForeignKey(AdmissionPeriod, on_delete=models.PROTECT)
    classification = models.CharField(max_length=12, choices=Classification.choices)
    grade_level = models.PositiveSmallIntegerField(choices=GRADES, null=True, blank=True)
    track = models.CharField(max_length=24, choices=Track.choices, blank=True)
    program = models.ForeignKey(Program, null=True, blank=True, on_delete=models.PROTECT)
    is_required = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(grade_level__isnull=True) | models.Q(grade_level__in=[11, 12])),
                name="requirement_shs_grade",
            ),
        ]

    def __str__(self):
        return f"{self.requirement} ({self.classification})"


def document_path(instance, filename):
    return f"applications/{instance.application_id}/{uuid.uuid4().hex}.pdf"


class DocumentSubmission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.PROTECT, related_name="documents")
    requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT)
    file = models.FileField(storage=PrivateMediaStorage(), upload_to=document_path, max_length=250)
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=50, default="application/pdf")
    file_size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    version = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["application", "requirement", "version"], name="document_version_unique"
            )
        ]

    def __str__(self):
        return f"{self.requirement} v{self.version}"


class DocumentReview(models.Model):
    class Decision(models.TextChoices):
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        RESUBMISSION_REQUESTED = "RESUBMISSION_REQUESTED", "Resubmission requested"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.OneToOneField(
        DocumentSubmission, on_delete=models.PROTECT, related_name="review"
    )
    decision = models.CharField(max_length=24, choices=Decision.choices)
    remarks = models.TextField(blank=True, max_length=2000)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reviewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-reviewed_at"]
        permissions = [("review_document", "Can decide a document review")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(decision__in=["VERIFIED", "REJECTED", "RESUBMISSION_REQUESTED"]),
                name="document_review_decision",
            ),
            models.CheckConstraint(
                condition=models.Q(decision="VERIFIED") | ~models.Q(remarks=""),
                name="document_review_requires_remarks",
            ),
        ]

    def __str__(self):
        return f"{self.document_id}: {self.decision}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Document reviews are immutable; review a replacement version instead.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Document reviews are immutable.")
