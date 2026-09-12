from django.utils import timezone
from rest_framework import serializers

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
from .permissions import staff_can
from .services import document_review_status, validate_application_configuration


class SchoolYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolYear
        fields = "__all__"

    def validate(self, attrs):
        start = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        end = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if start and end and start > end:
            raise serializers.ValidationError({"ends_on": "End must be on or after start."})
        return attrs


class AdmissionPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdmissionPeriod
        fields = "__all__"

    def validate(self, attrs):
        start = attrs.get("opens_on", getattr(self.instance, "opens_on", None))
        end = attrs.get("closes_on", getattr(self.instance, "closes_on", None))
        if start and end and start > end:
            raise serializers.ValidationError({"closes_on": "Close must be on or after opening."})
        return attrs


class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = "__all__"

    def validate(self, attrs):
        if self.instance and attrs.get("track", self.instance.track) != self.instance.track:
            if self.instance.application_set.exists() or self.instance.requirementrule_set.exists():
                raise serializers.ValidationError(
                    {"track": "An in-use program cannot change track."}
                )
        return attrs


class LearnerSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(read_only=True)

    class Meta:
        model = Learner
        fields = "__all__"

    def validate_birthdate(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Birthdate cannot be in the future.")
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        if user.role == "APPLICANT":
            if "owner" in attrs and attrs["owner"] != user:
                raise serializers.ValidationError(
                    {"owner": "You can only manage your own profile."}
                )
            attrs["owner"] = user
        elif attrs.get("owner") and attrs["owner"].role != "APPLICANT":
            raise serializers.ValidationError({"owner": "Choose an applicant account."})
        if self.instance and "owner" in attrs and attrs["owner"] != self.instance.owner:
            raise serializers.ValidationError({"owner": "Profile ownership cannot be reassigned."})
        return attrs


class ApplicationSerializer(serializers.ModelSerializer):
    learner_name = serializers.CharField(source="learner.__str__", read_only=True)
    period_name = serializers.CharField(source="admission_period.name", read_only=True)
    program_name = serializers.CharField(
        source="program.name", read_only=True, default=None, allow_null=True
    )
    applicant = serializers.UUIDField(source="learner.owner_id", read_only=True, allow_null=True)

    class Meta:
        model = Application
        fields = "__all__"
        read_only_fields = ["reference", "created_by", "status", "submitted_at"]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.role == "APPLICANT":
            fields["learner"].queryset = Learner.objects.filter(owner=request.user)
        return fields

    def validate(self, attrs):
        user = self.context["request"].user
        learner = attrs.get("learner", getattr(self.instance, "learner", None))
        if user.role == "APPLICANT" and learner.owner_id != user.pk:
            raise serializers.ValidationError({"learner": "Select your own learner profile."})
        if user.role != "APPLICANT" and not staff_can(user, "view_learner"):
            raise serializers.ValidationError({"learner": "Learner access permission is required."})
        source = attrs.get("source", getattr(self.instance, "source", "ONLINE"))
        setting_source = not self.instance or source != self.instance.source
        if (
            setting_source
            and source == "WALK_IN"
            and user.role not in {"REGISTRAR", "ADMINISTRATOR"}
        ):
            raise serializers.ValidationError(
                {"source": "Only registrar/administrator staff may create walk-ins."}
            )
        if self.instance:
            for field in ["learner", "admission_period"]:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError(
                        {field: "Cannot change after draft creation."}
                    )
            if self.instance.documents.exists():
                for field in ["grade_level", "track", "program", "classification"]:
                    if field in attrs and attrs[field] != getattr(self.instance, field):
                        raise serializers.ValidationError(
                            {field: "Cannot change after document upload."}
                        )
        candidate = Application()
        if self.instance:
            for field in ["admission_period", "program", "track", "source"]:
                setattr(candidate, field, getattr(self.instance, field))
        for field, value in attrs.items():
            setattr(candidate, field, value)
        validate_application_configuration(candidate)
        return attrs


class RequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Requirement
        fields = "__all__"


class RequirementRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementRule
        fields = "__all__"

    def validate(self, attrs):
        program = attrs.get("program", getattr(self.instance, "program", None))
        track = attrs.get("track", getattr(self.instance, "track", ""))
        if program and track and program.track != track:
            raise serializers.ValidationError({"program": "Program must match the selected track."})
        return attrs


class DocumentReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = DocumentReview
        fields = ["id", "decision", "remarks", "reviewed_at", "reviewer_name"]
        read_only_fields = fields

    def get_reviewer_name(self, review) -> str:
        return review.reviewed_by.get_full_name() or "Registrar"


class ReviewDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=DocumentReview.Decision.choices)
    remarks = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["decision"] != "VERIFIED" and not attrs["remarks"].strip():
            raise serializers.ValidationError(
                {"remarks": "Explain the rejection or correction needed."}
            )
        return attrs


class DocumentSerializer(serializers.ModelSerializer):
    review = DocumentReviewSerializer(read_only=True, allow_null=True)
    review_status = serializers.SerializerMethodField()
    application_reference = serializers.CharField(source="application.reference", read_only=True)
    learner_name = serializers.CharField(source="application.learner.__str__", read_only=True)
    period_name = serializers.CharField(source="application.admission_period.name", read_only=True)
    is_latest = serializers.BooleanField(read_only=True, default=True)

    def get_review_status(self, document) -> str:
        return document_review_status(document)

    requirement_name = serializers.CharField(source="requirement.name", read_only=True)
    stored_filename = serializers.CharField(source="file.name", read_only=True)

    class Meta:
        model = DocumentSubmission
        exclude = ["file"]
        read_only_fields = [field.name for field in DocumentSubmission._meta.fields]


class DocumentUploadSerializer(serializers.Serializer):
    application = serializers.PrimaryKeyRelatedField(queryset=Application.objects.all())
    requirement = serializers.PrimaryKeyRelatedField(queryset=Requirement.objects.all())
    file = serializers.FileField(help_text="Readable, unencrypted PDF; maximum 31,457,280 bytes.")


class ChecklistSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_required = serializers.BooleanField()
    uploaded = serializers.BooleanField()
    review_status = serializers.CharField()
    can_upload = serializers.BooleanField()
    latest_document = serializers.UUIDField(allow_null=True)


class ReviewQueueSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = DocumentSerializer(many=True)
