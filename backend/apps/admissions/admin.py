from django.contrib import admin

from .models import (
    AdmissionPeriod,
    Application,
    DocumentReview,
    DocumentSubmission,
    Learner,
    Program,
    Requirement,
    RequirementRule,
    SchoolYear,
)
from .serializers import (
    AdmissionPeriodSerializer,
    ProgramSerializer,
    RequirementRuleSerializer,
    SchoolYearSerializer,
)
from .services import audit, seed_period_requirements


class ConfigurationAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if isinstance(obj, AdmissionPeriod) and not change:
            seed_period_requirements(obj)
        audit(obj, "UPDATE_CONFIGURATION" if change else "CREATE_CONFIGURATION", request)

    def delete_model(self, request, obj):
        audit(obj, "DELETE_CONFIGURATION", request)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)

    def get_form(self, request, obj=None, **kwargs):
        base_form = super().get_form(request, obj, **kwargs)
        serializer_type = {
            SchoolYear: SchoolYearSerializer,
            AdmissionPeriod: AdmissionPeriodSerializer,
            Program: ProgramSerializer,
            RequirementRule: RequirementRuleSerializer,
        }.get(self.model)

        class ValidatedForm(base_form):
            def clean(self):
                from django.core.exceptions import ValidationError
                from rest_framework.exceptions import ValidationError as APIValidationError

                data = super().clean()
                if serializer_type:
                    try:
                        serializer_type(instance=obj).validate(data)
                    except APIValidationError as exc:
                        raise ValidationError(str(exc.detail)) from exc
                return data

        return ValidatedForm


for model in [SchoolYear, AdmissionPeriod, Program, Requirement, RequirementRule]:
    admin.site.register(model, ConfigurationAdmin)


class WorkflowAdmin(admin.ModelAdmin):
    """Development inspection only; workflow writes must use audited API services."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Learner)
class LearnerAdmin(WorkflowAdmin):
    list_display = ["first_name", "last_name", "lrn", "owner"]
    search_fields = ["first_name", "last_name", "lrn"]


@admin.register(Application)
class ApplicationAdmin(WorkflowAdmin):
    list_display = ["reference", "learner", "admission_period", "grade_level", "status"]
    list_filter = ["status", "admission_period", "grade_level", "track"]


@admin.register(DocumentSubmission)
class DocumentAdmin(WorkflowAdmin):
    list_display = ["application", "requirement", "version", "uploaded_at"]
    exclude = ["file"]


@admin.register(DocumentReview)
class DocumentReviewAdmin(WorkflowAdmin):
    list_display = ["document", "decision", "reviewed_by", "reviewed_at"]
    list_filter = ["decision", "reviewed_at"]


# Registered for inspection tooling; no technical-admin URL is exposed.
from .enrollment_models import (  # noqa: E402
    EnrollmentEvent,
    GuidanceInterview,
    LisRecord,
    Section,
    SectionAssignment,
    TrackConfiguration,
)

for model in [
    TrackConfiguration,
    Section,
    SectionAssignment,
    GuidanceInterview,
    EnrollmentEvent,
    LisRecord,
]:
    admin.site.register(model, WorkflowAdmin)
