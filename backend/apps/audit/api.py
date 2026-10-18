from django.utils.dateparse import parse_date
from rest_framework import mixins, serializers, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission

from apps.accounts.administration import Page20

from .models import AuditEvent


class AuditPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and (
            user.is_superuser
            or (user.role == "ADMINISTRATOR" and user.has_perm("audit.view_auditevent"))
        )


class AuditSerializer(serializers.ModelSerializer):
    actor = serializers.EmailField(source="user.email", read_only=True, allow_null=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "actor",
            "action",
            "entity",
            "entity_id",
            "created_at",
            "ip_address",
            "metadata",
        )
        read_only_fields = fields


class AuditViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditEvent.objects.select_related("user").order_by("-created_at", "-pk")
    serializer_class = AuditSerializer
    permission_classes = [AuditPermission]
    pagination_class = Page20

    def get_queryset(self):
        queryset = self.queryset
        for param, field in [
            ("actor", "user__email__icontains"),
            ("action", "action__icontains"),
            ("entity", "entity"),
            ("entity_id", "entity_id"),
        ]:
            value = self.request.query_params.get(param, "").strip()[:150]
            if value:
                queryset = queryset.filter(**{field: value})
        for param, lookup in [("from", "created_at__date__gte"), ("to", "created_at__date__lte")]:
            value = self.request.query_params.get(param)
            if value:
                try:
                    day = parse_date(value)
                except ValueError:
                    day = None
                if day is None:
                    raise ValidationError({param: "Use a valid YYYY-MM-DD date."})
                queryset = queryset.filter(**{lookup: day})
        return queryset
