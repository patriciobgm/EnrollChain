"""Early-enrollment extensions to the existing admissions domain."""

from django.conf import settings
from django.db import models


class TrackConfiguration(models.Model):
    class Category(models.TextChoices):
        ACADEMIC = "ACADEMIC", "Academic"
        TECHPRO = "TECHPRO", "Technical Professional"

    code = models.CharField(max_length=24, primary_key=True)
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=12, choices=Category.choices)
    default_section_capacity = models.PositiveSmallIntegerField()
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(default_section_capacity__gte=1), name="track_positive_capacity"
            )
        ]

    def __str__(self):
        return self.name


class Section(models.Model):
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=100)
    school_year = models.ForeignKey("admissions.SchoolYear", on_delete=models.PROTECT)
    track = models.ForeignKey(TrackConfiguration, on_delete=models.PROTECT)
    program = models.ForeignKey("admissions.Program", on_delete=models.PROTECT)
    grade_level = models.PositiveSmallIntegerField(choices=[(11, "Grade 11"), (12, "Grade 12")])
    capacity = models.PositiveSmallIntegerField()
    adviser = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="advised_sections",
    )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code", "pk"]
        constraints = [
            models.UniqueConstraint(fields=["school_year", "code"], name="section_code_year"),
            models.CheckConstraint(
                condition=models.Q(capacity__gte=1), name="section_positive_capacity"
            ),
            models.CheckConstraint(
                condition=models.Q(grade_level__in=[11, 12]), name="section_shs_grade"
            ),
        ]

    def __str__(self):
        return self.name


class SectionAssignment(models.Model):
    application = models.OneToOneField(
        "admissions.Application", on_delete=models.PROTECT, related_name="section_assignment"
    )
    learner = models.ForeignKey("admissions.Learner", on_delete=models.PROTECT)
    school_year = models.ForeignKey("admissions.SchoolYear", on_delete=models.PROTECT)
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner", "school_year"], name="one_learner_section_year"
            )
        ]

    def __str__(self):
        return f"{self.application_id}: {self.section}"


class GuidanceInterview(models.Model):
    application = models.OneToOneField(
        "admissions.Application", on_delete=models.PROTECT, related_name="guidance_interview"
    )
    officer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    completed_at = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True, max_length=2000)

    def __str__(self):
        return str(self.application_id)


class EnrollmentEvent(models.Model):
    application = models.ForeignKey(
        "admissions.Application", on_delete=models.PROTECT, related_name="enrollment_events"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=60)
    old_status = models.CharField(max_length=32, blank=True)
    new_status = models.CharField(max_length=32)
    remarks = models.TextField(blank=True, max_length=2000)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "pk"]

    def __str__(self):
        return f"{self.application_id}: {self.action}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Enrollment history is append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Enrollment history is append-only.")


class LisRecord(models.Model):
    class Status(models.TextChoices):
        NOT_READY = "NOT_READY", "Not ready"
        READY_FOR_LIS = "READY_FOR_LIS", "Ready for LIS"
        SUBMITTED_TO_LIS = "SUBMITTED_TO_LIS", "Submitted to LIS"
        LIS_CONFIRMED = "LIS_CONFIRMED", "LIS confirmed"
        LIS_REJECTED = "LIS_REJECTED", "LIS rejected"

    application = models.OneToOneField(
        "admissions.Application", on_delete=models.PROTECT, related_name="lis_record"
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.NOT_READY)
    reference = models.CharField(max_length=100, blank=True)
    submission_date = models.DateTimeField(null=True, blank=True)
    confirmation_date = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    remarks = models.TextField(blank=True, max_length=2000)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.application_id}: {self.status}"
