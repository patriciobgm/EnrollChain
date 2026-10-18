from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.administration import Page20
from apps.common.sorting import ordered

from .enrollment_services import (
    LisIntegrationService,
    assign_section,
    authorize,
    complete_interview,
    confirm_pre_enrollment,
    eligibility,
    evaluate,
    event,
    refresh_document_stage,
)
from .models import (
    Application,
    EnrollmentEvent,
    GuidanceInterview,
    LisRecord,
    Program,
    SchoolYear,
    Section,
    SectionAssignment,
    TrackConfiguration,
)
from .permissions import staff_can
from .serializers import ApplicationSerializer
from .services import audit
from .views import ConfigurationViewSet


class TrackConfigurationSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=2000
    )

    class Meta:
        model = TrackConfiguration
        fields = "__all__"
        extra_kwargs = {"default_section_capacity": {"required": False}}

    def validate(self, attrs):
        if self.instance and attrs.get("code", self.instance.code) != self.instance.code:
            raise ValidationError(
                {"code": "Track codes are stable references and cannot be renamed."}
            )
        if (
            self.instance
            and attrs.get("category", self.instance.category) != self.instance.category
        ):
            raise ValidationError(
                {"category": "Create a new track rather than recategorize existing records."}
            )
        defaults = {"ACADEMIC": 40, "TECHPRO": 25}
        category = attrs.get("category", getattr(self.instance, "category", None))
        if not self.instance:
            attrs.setdefault("default_section_capacity", defaults.get(category, 40))
        if "default_section_capacity" in attrs and (
            (
                self.instance
                and attrs["default_section_capacity"] != self.instance.default_section_capacity
            )
            or (not self.instance and attrs["default_section_capacity"] != defaults.get(category))
        ):
            if not attrs.get("reason", "").strip():
                raise ValidationError({"reason": "Explain the capacity configuration override."})
        return attrs


class TrackConfigurationViewSet(ConfigurationViewSet):
    queryset = TrackConfiguration.objects.all()
    serializer_class = TrackConfigurationSerializer

    def perform_create(self, serializer):
        reason = serializer.validated_data.pop("reason", "")
        with transaction.atomic():
            instance = serializer.save()
            audit(
                instance,
                "CREATE_TRACK",
                self.request,
                {"capacity": instance.default_section_capacity, "reason": reason},
            )

    def perform_update(self, serializer):
        reason = serializer.validated_data.pop("reason", "")
        with transaction.atomic():
            old = serializer.instance.default_section_capacity
            instance = serializer.save()
            audit(
                instance,
                "UPDATE_TRACK",
                self.request,
                {
                    "old_capacity": old,
                    "new_capacity": instance.default_section_capacity,
                    "reason": reason,
                },
            )

    def perform_destroy(self, instance):
        raise ValidationError("Deactivate tracks to preserve historical references.")


class SectionSerializer(serializers.ModelSerializer):
    current_count = serializers.IntegerField(read_only=True)
    available_slots = serializers.SerializerMethodField()
    utilization = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    track_name = serializers.CharField(source="track.name", read_only=True)
    program_name = serializers.CharField(source="program.name", read_only=True)
    reason = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=2000
    )

    class Meta:
        model = Section
        fields = "__all__"
        extra_kwargs = {"capacity": {"required": False}}

    def get_available_slots(self, section) -> int:
        return max(
            0, section.capacity - getattr(section, "current_count", section.assignments.count())
        )

    def get_utilization(self, section) -> float:
        return round(
            100 * (section.capacity - self.get_available_slots(section)) / section.capacity, 1
        )

    def get_status(self, section) -> str:
        return (
            "INACTIVE"
            if not section.active
            else "FULL"
            if self.get_available_slots(section) == 0
            else "AVAILABLE"
        )

    def validate(self, attrs):
        track = attrs.get("track", getattr(self.instance, "track", None))
        program = attrs.get("program", getattr(self.instance, "program", None))
        if track and program and track.pk != program.track:
            raise ValidationError({"program": "The program must belong to the section's track."})
        if not self.instance and track:
            attrs.setdefault("capacity", track.default_section_capacity)
        capacity = attrs.get("capacity", getattr(self.instance, "capacity", 0))
        if capacity < 1:
            raise ValidationError({"capacity": "Capacity must be positive."})
        if self.instance:
            count = self.instance.assignments.count()
            if capacity < count:
                raise ValidationError(
                    {"capacity": "Capacity cannot be reduced below the assigned count."}
                )
            if count and any(
                field in attrs and attrs[field] != getattr(self.instance, field)
                for field in ["track", "program", "school_year", "grade_level"]
            ):
                raise ValidationError("An occupied section cannot change its matching rules.")
        override = (
            self.instance
            and capacity != self.instance.capacity
            or not self.instance
            and track
            and capacity != track.default_section_capacity
        )
        if override and not attrs.get("reason", "").strip():
            raise ValidationError({"reason": "Explain the capacity override."})
        adviser = attrs.get("adviser", getattr(self.instance, "adviser", None))
        if adviser and (adviser.role != "CLASS_ADVISER" or not adviser.is_active):
            raise ValidationError({"adviser": "Choose an active class adviser."})
        return attrs


class AssignmentSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    section_code = serializers.CharField(source="section.code", read_only=True)

    class Meta:
        model = SectionAssignment
        fields = ["id", "section", "section_name", "section_code", "assigned_at"]


class LisSerializer(serializers.ModelSerializer):
    class Meta:
        model = LisRecord
        fields = [
            "status",
            "reference",
            "submission_date",
            "confirmation_date",
            "confirmed_by",
            "remarks",
        ]
        read_only_fields = fields


class EnrollmentEventSerializer(serializers.ModelSerializer):
    actor_role = serializers.CharField(source="actor.role", read_only=True)

    class Meta:
        model = EnrollmentEvent
        fields = [
            "id",
            "action",
            "old_status",
            "new_status",
            "remarks",
            "metadata",
            "created_at",
            "actor_role",
        ]
        read_only_fields = fields


class EnrollmentSerializer(ApplicationSerializer):
    school_year = serializers.IntegerField(source="admission_period.school_year_id", read_only=True)
    learner_lrn = serializers.CharField(source="learner.lrn", read_only=True, allow_null=True)
    learner_sex = serializers.CharField(source="learner.sex", read_only=True)
    eligibility = serializers.SerializerMethodField()
    section_assignment = AssignmentSerializer(read_only=True, allow_null=True)
    lis_record = LisSerializer(read_only=True, allow_null=True)
    enrollment_events = EnrollmentEventSerializer(many=True, read_only=True)
    guidance_completed = serializers.SerializerMethodField()
    track_name = serializers.SerializerMethodField()

    def get_eligibility(self, application) -> dict:
        return eligibility(application)

    def get_guidance_completed(self, application) -> bool:
        return GuidanceInterview.objects.filter(application=application).exists()

    def get_track_name(self, application) -> str:
        return (
            TrackConfiguration.objects.filter(pk=application.track)
            .values_list("name", flat=True)
            .first()
            or application.track
        )


class WorkflowActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            "complete_program",
            "interview",
            "qualify",
            "not_qualified",
            "reject",
            "reopen",
            "pre_enroll",
            "auto_assign",
            "assign",
            "remove_section",
            "lis_prepare",
            "lis_submit",
            "lis_confirm",
            "lis_reject",
        ]
    )
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    section = serializers.IntegerField(required=False, min_value=1)
    program = serializers.IntegerField(required=False, min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")


def scoped_applications(request):
    queryset = Application.objects.select_related(
        "learner",
        "program",
        "admission_period__school_year",
        "section_assignment__section",
        "lis_record",
    ).prefetch_related("enrollment_events__actor")
    user = request.user
    if user.role == "LEARNER":
        return queryset.filter(learner__owner=user)
    if user.role == "CLASS_ADVISER" and staff_can(user, "view_section"):
        return queryset.filter(section_assignment__section__adviser=user)
    if user.role == "GUIDANCE_OFFICER" and staff_can(user, "complete_interview"):
        return queryset.filter(status="SUBMITTED")
    if user.role in {"REGISTRAR", "ADMINISTRATOR"} and staff_can(user, "view_application"):
        return queryset
    raise PermissionDenied("Your account cannot access early enrollment records.")


def filter_applications(queryset, params):
    mappings = {
        "school_year": "admission_period__school_year_id",
        "grade_level": "grade_level",
        "classification": "classification",
        "track": "track",
        "program": "program_id",
        "section": "section_assignment__section_id",
        "status": "enrollment_status",
        "lis_status": "lis_record__status",
    }
    for key, field in mappings.items():
        value = params.get(key)
        if value:
            if (
                key in {"school_year", "grade_level", "program", "section"}
                and not str(value).isdigit()
            ):
                raise ValidationError({key: "Use a numeric identifier."})
            queryset = queryset.filter(**{field: value})
    search = params.get("search", "").strip()[:150]
    if search:
        queryset = queryset.filter(
            Q(reference__icontains=search)
            | Q(learner__first_name__icontains=search)
            | Q(learner__last_name__icontains=search)
            | Q(learner__lrn__icontains=search)
        )
    if params.get("unassigned") == "true":
        queryset = queryset.filter(
            enrollment_status="PRE_ENROLLED", section_assignment__isnull=True
        )
    if params.get("archive") in {"true", "false"}:
        archived = Q(admission_period__is_active=False) | Q(
            admission_period__school_year__ends_on__lt=timezone.localdate()
        )
        queryset = (
            queryset.filter(archived) if params["archive"] == "true" else queryset.exclude(archived)
        )
    if params.get("pending") == "true":
        queryset = queryset.exclude(enrollment_status__in=["OFFICIALLY_ENROLLED", "REJECTED"])
    if params.get("interview") == "pending":
        queryset = queryset.filter(guidance_interview__isnull=True, status="SUBMITTED")
    return ordered(
        queryset,
        params,
        {
            "name": "learner__last_name",
            "reference": "reference",
            "grade": "grade_level",
            "sex": "learner__sex",
            "program": "program__name",
            "section": "section_assignment__section__name",
            "stage": "enrollment_status",
            "lis": "lis_record__status",
            "created": "created_at",
        },
        "-created",
    )


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("grade_level", int, enum=[11, 12]),
            OpenApiParameter(
                "classification",
                str,
                enum=["NEW", "RETURNING", "TRANSFEREE"],
                description="RETURNING is displayed as Balik-Aral.",
            ),
        ]
    )
)
class EnrollmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Application.objects.all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = Page20

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        return filter_applications(scoped_applications(self.request), self.request.query_params)

    @extend_schema(request=WorkflowActionSerializer, responses=EnrollmentSerializer)
    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, pk=None):
        application = self.get_object()
        serializer = WorkflowActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        name, remarks = data["action"], data["remarks"]
        if name == "complete_program":
            authorize(request, {"REGISTRAR"}, "evaluate_application")
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=application.pk)
                if (
                    application.program_id
                    or application.enrollment_status
                    not in {
                        "DRAFT",
                        "SUBMITTED",
                        "FOR_DOCUMENT_VERIFICATION",
                        "FOR_EVALUATION",
                        "FOR_RESUBMISSION",
                    }
                    or not remarks.strip()
                ):
                    raise ValidationError(
                        "Only a missing legacy program can be completed with a reason."
                    )
                program = Program.objects.filter(
                    pk=data.get("program"), track=application.track, is_active=True
                ).first()
                if not program:
                    raise ValidationError(
                        {"program": "Choose an active program matching the track."}
                    )
                application.program = program
                application.save(update_fields=["program", "updated_at"])
                event(
                    application,
                    "LEGACY_PROGRAM_COMPLETED",
                    request,
                    remarks=remarks,
                    metadata={"old_program": None, "new_program": program.pk},
                )
                refresh_document_stage(application, request)
        elif name == "interview":
            complete_interview(application, request, remarks)
        elif name in {"qualify", "not_qualified", "reject"}:
            evaluate(
                application,
                request,
                {"qualify": "QUALIFIED", "not_qualified": "NOT_QUALIFIED", "reject": "REJECTED"}[
                    name
                ],
                remarks,
            )
        elif name == "pre_enroll":
            confirm_pre_enrollment(application, request, remarks)
        elif name == "reopen":
            authorize(request, {"REGISTRAR"}, "evaluate_application")
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=application.pk)
                if (
                    application.enrollment_status not in {"QUALIFIED", "NOT_QUALIFIED", "REJECTED"}
                    or not remarks.strip()
                ):
                    raise ValidationError(
                        "Reopening requires an evaluation-stage record and a reason; "
                        "pre-enrolled records cannot be reopened here."
                    )
                application.qualification_snapshot = {}
                application.save(update_fields=["qualification_snapshot"])
                event(application, "EVALUATION_REOPENED", request, "FOR_EVALUATION", remarks)
                refresh_document_stage(application, request)
        elif name in {"auto_assign", "assign", "remove_section"}:
            if name == "assign" and "section" not in data:
                raise ValidationError({"section": "Choose a section."})
            assign_section(
                application,
                request,
                section_id=data.get("section"),
                automatic=name == "auto_assign",
                remove=name == "remove_section",
                remarks=remarks,
            )
        else:
            LisIntegrationService.transition(
                application, request, name.removeprefix("lis_"), data["reference"], remarks
            )
        return Response(
            self.get_serializer(scoped_applications(request).get(pk=application.pk)).data
        )


class SectionViewSet(ConfigurationViewSet):
    queryset = Section.objects.select_related(
        "track", "program", "school_year", "adviser"
    ).annotate(current_count=Count("assignments"))
    serializer_class = SectionSerializer

    def list(self, request, *args, **kwargs):
        if "page" not in request.query_params:
            return super().list(request, *args, **kwargs)
        paginator = Page20()
        page = paginator.paginate_queryset(
            ordered(
                self.get_queryset(),
                request.query_params,
                {
                    "name": "name",
                    "code": "code",
                    "capacity": "capacity",
                    "assigned": "current_count",
                },
                "code",
            ),
            request,
        )
        return paginator.get_paginated_response(self.get_serializer(page, many=True).data)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        user = self.request.user
        if user.role == "CLASS_ADVISER" and staff_can(user, "view_section"):
            queryset = self.queryset.filter(adviser=user)
        elif user.role in {"REGISTRAR", "ADMINISTRATOR"} and staff_can(user, "view_section"):
            queryset = self.queryset
        else:
            raise PermissionDenied("Section management is available to authorized staff only.")
        for key in ["school_year", "grade_level", "track", "program"]:
            value = self.request.query_params.get(key)
            if value:
                if key != "track" and not value.isdigit():
                    raise ValidationError({key: "Use a numeric identifier."})
                queryset = queryset.filter(**{key: value})
        return queryset

    def perform_create(self, serializer):
        authorize(self.request, {"ADMINISTRATOR"}, "add_section")
        reason = serializer.validated_data.pop("reason", "")
        with transaction.atomic():
            SchoolYear.objects.select_for_update().get(
                pk=serializer.validated_data["school_year"].pk
            )
            section = serializer.save()
            audit(
                section,
                "SECTION_CREATED",
                self.request,
                {"capacity": section.capacity, "reason": reason},
            )

    def perform_update(self, serializer):
        authorize(self.request, {"ADMINISTRATOR"}, "change_section")
        with transaction.atomic():
            year_ids = {
                serializer.instance.school_year_id,
                serializer.validated_data.get("school_year", serializer.instance.school_year).pk,
            }
            list(SchoolYear.objects.select_for_update().filter(pk__in=year_ids).order_by("pk"))
            locked = Section.objects.select_for_update().get(pk=serializer.instance.pk)
            serializer.instance = locked
            serializer.validate(serializer.validated_data)
            reason = serializer.validated_data.pop("reason", "")
            old = locked.capacity
            section = serializer.save()
            audit(
                section,
                "SECTION_UPDATED",
                self.request,
                {"old_capacity": old, "new_capacity": section.capacity, "reason": reason},
            )

    def perform_destroy(self, instance):
        raise ValidationError("Deactivate sections to preserve assignment history.")

    @extend_schema(responses=EnrollmentSerializer(many=True))
    @action(detail=True, methods=["get"])
    def roster(self, request, pk=None):
        section = self.get_object()
        queryset = filter_applications(
            scoped_applications(request).filter(section_assignment__section=section),
            request.query_params,
        )
        if "page" in request.query_params:
            paginator = Page20()
            page = paginator.paginate_queryset(queryset, request)
            return paginator.get_paginated_response(
                EnrollmentSerializer(page, many=True, context={"request": request}).data
            )
        return Response(
            EnrollmentSerializer(queryset, many=True, context={"request": request}).data
        )
