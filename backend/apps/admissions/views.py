from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q
from django.db.models.deletion import ProtectedError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

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
from .permissions import AdmissionsPermission, staff_can
from .serializers import (
    AdmissionPeriodSerializer,
    ApplicationSerializer,
    ChecklistSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
    LearnerSerializer,
    ProgramSerializer,
    RequirementRuleSerializer,
    RequirementSerializer,
    ReviewDecisionSerializer,
    ReviewQueueSerializer,
    SchoolYearSerializer,
)
from .services import (
    audit,
    checklist,
    ensure_draft,
    review_document,
    seed_period_requirements,
    submit_application,
    upload_document,
)


class AuditedWriteMixin:
    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                instance = serializer.save()
                if isinstance(instance, AdmissionPeriod):
                    seed_period_requirements(instance)
                audit(instance, "CREATE_" + type(instance).__name__.upper(), self.request)
        except IntegrityError as exc:
            raise ValidationError("This record conflicts with an existing record.") from exc

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                instance = serializer.save()
                audit(instance, "UPDATE_" + type(instance).__name__.upper(), self.request)
        except IntegrityError as exc:
            raise ValidationError("This record conflicts with an existing record.") from exc

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                audit(instance, "DELETE_" + type(instance).__name__.upper(), self.request)
                instance.delete()
        except ProtectedError as exc:
            raise ValidationError("This record is in use and cannot be deleted.") from exc


class ConfigurationViewSet(AuditedWriteMixin, viewsets.ModelViewSet):
    permission_classes = [AdmissionsPermission]
    configuration = True


class SchoolYearViewSet(ConfigurationViewSet):
    queryset = SchoolYear.objects.all()
    serializer_class = SchoolYearSerializer


class AdmissionPeriodViewSet(ConfigurationViewSet):
    queryset = AdmissionPeriod.objects.select_related("school_year")
    serializer_class = AdmissionPeriodSerializer


class ProgramViewSet(ConfigurationViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer


class RequirementViewSet(ConfigurationViewSet):
    queryset = Requirement.objects.all().order_by("name")
    serializer_class = RequirementSerializer


class RequirementRuleViewSet(ConfigurationViewSet):
    queryset = RequirementRule.objects.select_related("requirement", "admission_period", "program")
    serializer_class = RequirementRuleSerializer


class OwnedViewSet(
    AuditedWriteMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [AdmissionsPermission]
    owner_lookup = "owner"

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return queryset.none()
        if self.request.user.role == "APPLICANT":
            return queryset.filter(**{self.owner_lookup: self.request.user})
        return queryset


class LearnerViewSet(OwnedViewSet):
    queryset = Learner.objects.all()
    serializer_class = LearnerSerializer

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            learner = (
                self.get_queryset().select_for_update(of=("self",)).get(pk=self.get_object().pk)
            )
            if learner.applications.filter(status="SUBMITTED").exists():
                raise ValidationError(
                    "Profile changes after submission require a future correction workflow."
                )
            return super().update(request, *args, **kwargs)


class ApplicationViewSet(OwnedViewSet):
    queryset = Application.objects.select_related("learner", "admission_period", "program")
    serializer_class = ApplicationSerializer
    owner_lookup = "learner__owner"

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                instance = serializer.save(created_by=self.request.user)
                audit(instance, "CREATE_APPLICATION", self.request)
        except IntegrityError as exc:
            raise ValidationError("A learner may apply only once per admission period.") from exc

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            instance = (
                self.get_queryset().select_for_update(of=("self",)).get(pk=self.get_object().pk)
            )
            ensure_draft(instance)
            return super().update(request, *args, **kwargs)

    @extend_schema(request=None, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        application = submit_application(self.get_object(), request)
        return Response(self.get_serializer(application).data)

    @extend_schema(responses=ChecklistSerializer(many=True))
    @action(detail=True, methods=["get"])
    def requirements(self, request, pk=None):
        return Response(checklist(self.get_object()))


class DocumentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = DocumentSubmission.objects.select_related(
        "application__learner",
        "application__admission_period",
        "requirement",
        "review__reviewed_by",
    ).annotate(
        is_latest=~Exists(
            DocumentSubmission.objects.filter(
                application_id=OuterRef("application_id"),
                requirement_id=OuterRef("requirement_id"),
                version__gt=OuterRef("version"),
            )
        )
    )
    serializer_class = DocumentSerializer
    permission_classes = [AdmissionsPermission]
    parser_classes = [MultiPartParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return queryset.none()
        if self.request.user.role == "APPLICANT":
            queryset = queryset.filter(application__learner__owner=self.request.user)
        application = self.request.query_params.get("application")
        if application:
            from django.core.exceptions import ValidationError as DjangoValidationError

            try:
                queryset = queryset.filter(application_id=application)
            except DjangoValidationError as exc:
                raise ValidationError({"application": "Invalid application ID."}) from exc
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter("status", enum=["PENDING", *DocumentReview.Decision.values, "ALL"]),
            OpenApiParameter("search", str),
            OpenApiParameter("page", int),
        ],
        responses=ReviewQueueSerializer,
    )
    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        queryset = self.get_queryset().filter(is_latest=True, application__status="SUBMITTED")
        state = request.query_params.get("status", "PENDING")
        if state == "PENDING":
            queryset = queryset.filter(review__isnull=True)
        elif state in DocumentReview.Decision.values:
            queryset = queryset.filter(review__decision=state)
        elif state != "ALL":
            raise ValidationError({"status": "Unknown review status."})
        search = request.query_params.get("search", "").strip()[:150]
        if search:
            queryset = queryset.filter(
                Q(application__reference__icontains=search)
                | Q(application__learner__first_name__icontains=search)
                | Q(application__learner__last_name__icontains=search)
                | Q(requirement__name__icontains=search)
            )
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(queryset.order_by("uploaded_at", "pk"), request)
        return paginator.get_paginated_response(self.get_serializer(page, many=True).data)

    @extend_schema(request=ReviewDecisionSerializer, responses=DocumentSerializer)
    @action(detail=True, methods=["post"], parser_classes=[JSONParser])
    def review(self, request, pk=None):
        document = self.get_object()
        serializer = ReviewDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review_document(document=document, request=request, **serializer.validated_data)
        return Response(self.get_serializer(self.get_queryset().get(pk=document.pk)).data)

    @extend_schema(parameters=[OpenApiParameter("application", OpenApiTypes.UUID)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=DocumentUploadSerializer,
        responses={201: DocumentSerializer},
        description="Upload an unencrypted PDF up to 30 MiB to a draft or replace a document "
        "explicitly flagged for resubmission on a submitted application. "
        "Creates a new retained version and an audit event; does not verify or anchor it on-chain.",
    )
    def create(self, request, *args, **kwargs):
        serializer = DocumentUploadSerializer(data=request.data)
        applications = Application.objects.all()
        if request.user.role == "APPLICANT":
            applications = applications.filter(learner__owner=request.user)
        elif not staff_can(request.user, "view_application"):
            raise PermissionDenied("Application access permission is required.")
        serializer.fields["application"].queryset = applications
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        document = upload_document(
            application=data["application"],
            requirement=data["requirement"],
            upload=data["file"],
            request=request,
        )
        return Response(DocumentSerializer(document).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        document = get_object_or_404(self.get_queryset(), pk=pk)
        try:
            file = document.file.open("rb")
        except FileNotFoundError as exc:
            from rest_framework.exceptions import NotFound

            raise NotFound("Document file is unavailable.") from exc
        audit(document, "DOWNLOAD_DOCUMENT", request)
        response = FileResponse(
            file,
            as_attachment=True,
            filename=document.original_filename,
            content_type="application/pdf",
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
