from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q
from django.db.models.deletion import ProtectedError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    PolymorphicProxySerializer,
    extend_schema,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.common.sorting import ordered

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
    GroupedReviewQueueSerializer,
    IntegrityUploadSerializer,
    LearnerSerializer,
    LinkApplicantSerializer,
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
    link_applicant,
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
        if self.request.user.role == "LEARNER":
            return queryset.filter(**{self.owner_lookup: self.request.user})
        return queryset


class LearnerViewSet(OwnedViewSet):
    queryset = Learner.objects.select_related("owner").order_by("last_name", "first_name", "id")

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()[:150]
        for term in search.split():
            queryset = queryset.filter(
                Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
                | Q(lrn__icontains=term)
                | Q(owner__email__icontains=term)
            )
        return ordered(
            queryset,
            self.request.query_params,
            {
                "name": "last_name",
                "lrn": "lrn",
                "email": "owner__email",
                "school": "previous_school",
            },
            "name",
        )

    def list(self, request, *args, **kwargs):
        if request.user.role == "LEARNER" and "page" not in request.query_params:
            return super().list(request, *args, **kwargs)
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(self.get_queryset(), request, view=self)
        return paginator.get_paginated_response(self.get_serializer(page, many=True).data)

    serializer_class = LearnerSerializer

    @extend_schema(request=LinkApplicantSerializer, responses=LearnerSerializer)
    @action(detail=True, methods=["post"], url_path="link-applicant")
    def link_applicant(self, request, pk=None):
        serializer = LinkApplicantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        learner = link_applicant(self.get_object(), serializer.validated_data["owner"], request)
        return Response(self.get_serializer(learner).data)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            learner = (
                self.get_queryset().select_for_update(of=("self",)).get(pk=self.get_object().pk)
            )
            completion_fields = {
                "last_grade_completed",
                "school_year_completed",
                "previous_school",
                "previous_section",
                "address",
                "contact_number",
            }
            if learner.applications.filter(status="SUBMITTED").exists() and (
                not set(request.data).issubset(completion_fields)
                or learner.applications.filter(
                    enrollment_status__in=[
                        "QUALIFIED",
                        "PRE_ENROLLED",
                        "SECTION_ASSIGNED",
                        "FOR_LIS_REGISTRATION",
                        "LIS_CONFIRMED",
                        "OFFICIALLY_ENROLLED",
                    ]
                ).exists()
            ):
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
        if self.request.user.role == "LEARNER":
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
            OpenApiParameter("group", str, enum=["application"]),
            OpenApiParameter("ordering", str),
            OpenApiParameter("search", str),
            OpenApiParameter("page", int),
        ],
        responses=PolymorphicProxySerializer(
            component_name="ReviewQueueResponse",
            serializers=[ReviewQueueSerializer, GroupedReviewQueueSerializer],
            resource_type_field_name=None,
        ),
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
        if request.query_params.get("group") == "application":
            from django.db.models import Count, Min

            groups = queryset.values(
                "application_id",
                "application__reference",
                "application__learner__first_name",
                "application__learner__last_name",
                "application__admission_period__name",
            ).annotate(document_count=Count("pk"), oldest_upload=Min("uploaded_at"))
            ordering = request.query_params.get("ordering", "name")
            fields = {
                "name": "application__learner__last_name",
                "reference": "application__reference",
                "uploaded": "oldest_upload",
                "documents": "document_count",
            }
            if ordering.removeprefix("-") not in fields:
                raise ValidationError({"ordering": "Choose a supported sort column."})
            groups = groups.order_by(
                ("-" if ordering.startswith("-") else "") + fields[ordering.removeprefix("-")],
                "application_id",
            )
            paginator = PageNumberPagination()
            paginator.page_size = 20
            page = paginator.paginate_queryset(groups, request)
            data = [
                {
                    "application": row["application_id"],
                    "reference": row["application__reference"],
                    "learner_name": (
                        f"{row['application__learner__first_name']} "
                        f"{row['application__learner__last_name']}"
                    ),
                    "period_name": row["application__admission_period__name"],
                    "document_count": row["document_count"],
                    "uploaded_at": row["oldest_upload"],
                }
                for row in page
            ]
            return paginator.get_paginated_response(data)
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
        if request.user.role == "LEARNER":
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
        return self._serve_pdf(request, pk, attachment=True)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        return self._serve_pdf(request, pk, attachment=False)

    @extend_schema(request=IntegrityUploadSerializer, responses=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser])
    def integrity(self, request, pk=None):
        from apps.blockchain_records.services import verify_integrity

        document = self.get_object()
        result = verify_integrity(document, request.FILES.get("file"))
        audit(
            document,
            "CHECK_DOCUMENT_INTEGRITY",
            request,
            {"result": result["status"], "source": result["source"]},
        )
        return Response(result)

    @extend_schema(
        parameters=[OpenApiParameter("origin", str, required=True)],
        responses={(200, "image/svg+xml"): OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=["get"], url_path="verification-qr")
    def verification_qr(self, request, pk=None):
        from urllib.parse import urlsplit

        from django.conf import settings
        from django.http import HttpResponse
        from reportlab.graphics import renderSVG
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing

        document = self.get_object()
        origin = request.query_params.get("origin", "")
        try:
            parsed = urlsplit(origin)
            valid = (
                parsed.scheme in {"http", "https"}
                and parsed.netloc
                and not parsed.username
                and not parsed.password
                and parsed.path in {"", "/"}
                and not parsed.query
                and not parsed.fragment
                and "\\" not in origin
                and (parsed.netloc == request.get_host() or origin in settings.CORS_ALLOWED_ORIGINS)
            )
        except ValueError:
            valid = False
        if not valid:
            raise ValidationError({"origin": "Use the current school portal origin."})
        url = f"{parsed.scheme}://{parsed.netloc}/verify-documents/{document.pk}"
        drawing = Drawing(256, 256)
        drawing.add(QrCodeWidget(url, barWidth=256, barHeight=256, barBorder=4))
        audit(document, "GENERATE_DOCUMENT_QR", request)
        response = HttpResponse(renderSVG.drawToString(drawing), content_type="image/svg+xml")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def _serve_pdf(self, request, pk, *, attachment):
        document = get_object_or_404(self.get_queryset(), pk=pk)
        try:
            file = document.file.open("rb")
        except FileNotFoundError as exc:
            from rest_framework.exceptions import NotFound

            raise NotFound("Document file is unavailable.") from exc
        audit(document, "DOWNLOAD_DOCUMENT" if attachment else "PREVIEW_DOCUMENT", request)
        response = FileResponse(
            file,
            as_attachment=attachment,
            filename=document.original_filename,
            content_type="application/pdf",
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
