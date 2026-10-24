import re
from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

from apps.admissions.models import Application, DocumentSubmission
from apps.audit.services import record_audit_event

from .models import BlockchainTransaction, TransactionStatus
from .services import configuration, process_record


class BlockchainSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockchainTransaction
        exclude = ["operation_key"]
        read_only_fields = [field.name for field in BlockchainTransaction._meta.fields]


class BlockchainPagination(CursorPagination):
    page_size = 20
    ordering = "-created_at"

    def get_ordering(self, request, queryset, view):
        ordering = request.query_params.get("ordering", "-created_at")
        if ordering not in {"created_at", "-created_at"}:
            raise ValidationError({"ordering": "Choose oldest or newest first."})
        return (ordering, "id")


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, enum=TransactionStatus.values),
            OpenApiParameter(
                "record_type",
                str,
                enum=["DOCUMENT_VERIFIED", "PRE_ENROLLMENT_CONFIRMED", "REGISTRATION_RECORDED"],
            ),
            OpenApiParameter(
                "search",
                str,
                description="Exact transaction hash, SHA-256 or opaque reference; 64 hex digits.",
            ),
            OpenApiParameter("ordering", str, enum=["created_at", "-created_at"]),
            OpenApiParameter("from", str, description="Inclusive creation date (YYYY-MM-DD)."),
            OpenApiParameter("to", str, description="Inclusive creation date (YYYY-MM-DD)."),
        ]
    )
)
class BlockchainViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = BlockchainTransaction.objects.all()
    serializer_class = BlockchainSerializer
    pagination_class = BlockchainPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        user = self.request.user
        queryset = self.queryset
        if user.role == "LEARNER":
            documents = DocumentSubmission.objects.filter(
                application__learner__owner=user
            ).values_list("pk", flat=True)
            applications = Application.objects.filter(learner__owner=user).values_list(
                "pk", flat=True
            )
            keys = [f"DOCUMENT_VERIFIED:{pk}" for pk in documents]
            keys += [
                f"{kind}:{pk}"
                for pk in applications
                for kind in ["PRE_ENROLLMENT_CONFIRMED", "REGISTRATION_RECORDED"]
            ]
            queryset = queryset.filter(operation_key__in=keys)
        elif user.role not in {"REGISTRAR", "ADMINISTRATOR"} or not user.has_perm(
            "blockchain_records.view_blockchaintransaction"
        ):
            raise PermissionDenied("Blockchain monitoring permission is required.")
        state = self.request.query_params.get("status")
        if state:
            if state not in TransactionStatus.values:
                raise ValidationError({"status": "Choose a supported transaction status."})
            queryset = queryset.filter(status=state)
        kind = self.request.query_params.get("record_type")
        if kind:
            if kind not in {
                "DOCUMENT_VERIFIED",
                "PRE_ENROLLMENT_CONFIRMED",
                "REGISTRATION_RECORDED",
            }:
                raise ValidationError({"record_type": "Choose a supported event type."})
            queryset = queryset.filter(record_type=kind)
        search = self.request.query_params.get("search", "").strip().lower()
        if search:
            if not re.fullmatch(r"(?:0x)?[a-f0-9]{64}", search):
                raise ValidationError(
                    {"search": "Enter a full transaction hash or SHA-256 (64 hex digits)."}
                )
            digest = search.removeprefix("0x")
            values = [digest, "0x" + digest]
            queryset = queryset.filter(
                Q(transaction_hash__in=values)
                | Q(record_hash__in=values)
                | Q(opaque_reference__in=values)
            )
        dates = {}
        for parameter, lookup in [
            ("from", "created_at__date__gte"),
            ("to", "created_at__date__lte"),
        ]:
            value = self.request.query_params.get(parameter)
            if value:
                dates[parameter] = serializers.DateField().run_validation(value)
                boundary = timezone.make_aware(
                    datetime.combine(dates[parameter], time.max if parameter == "to" else time.min)
                )
                queryset = queryset.filter(**{lookup: boundary})
        if "from" in dates and "to" in dates and dates["from"] > dates["to"]:
            raise ValidationError({"to": "End date must be on or after start date."})
        return queryset

    @extend_schema(request=None, responses=BlockchainSerializer)
    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        if request.user.role not in {"REGISTRAR", "ADMINISTRATOR"} or not request.user.has_perm(
            "blockchain_records.change_blockchaintransaction"
        ):
            raise PermissionDenied("Blockchain retry permission is required.")
        row = self.get_object()
        if row.status != "CONFIRMED":
            row = process_record(row.pk)
            record_audit_event(
                action="BLOCKCHAIN_RETRY",
                entity="BlockchainTransaction",
                entity_id=row.pk,
                user=request.user,
                request=request,
            )
        return Response(self.get_serializer(row).data)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["get"], url_path="connection")
    def connection_status(self, request):
        self.get_queryset()  # enforce the same role boundary
        config = configuration()
        return Response(
            {
                "enabled": config["enabled"],
                "chain_id": config["chain_id"],
                "contract_address": config["contract_address"],
                "network": "Local development" if config["chain_id"] == 31337 else "Configured EVM",
                "scope": "Integrity evidence; not proof of original credential authenticity.",
            }
        )
