from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.administration import Page20
from apps.admissions.models import Application, DocumentSubmission
from apps.audit.services import record_audit_event

from .models import BlockchainTransaction
from .services import configuration, process_record


class BlockchainSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockchainTransaction
        exclude = ["operation_key"]
        read_only_fields = [field.name for field in BlockchainTransaction._meta.fields]


class BlockchainViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = BlockchainTransaction.objects.all()
    serializer_class = BlockchainSerializer
    pagination_class = Page20

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
            queryset = queryset.filter(status=state)
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
