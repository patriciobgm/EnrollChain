from django.conf import settings
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.admissions.models import (
    AdmissionPeriod,
    Application,
    DocumentReview,
    DocumentSubmission,
    Learner,
)
from apps.admissions.permissions import staff_can
from apps.audit.models import AuditEvent
from apps.audit.services import record_audit_event
from apps.blockchain_records.services import configuration
from apps.common.sorting import ordered

from .models import User, UserRole
from .security import limit_attempts, require_password, verify_factor


class Page20(PageNumberPagination):
    page_size = 20


REGISTRAR_ACCOUNT_ROLES = {"LEARNER", "CLASS_ADVISER"}


class UserAdministrationPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        verb = {"create": "add", "update": "change", "partial_update": "change"}.get(
            view.action, "view"
        )
        if user.is_authenticated and user.role == "REGISTRAR":
            return view.action in {"list", "retrieve", "create", "metadata"} and user.has_perm(
                f"accounts.{verb}_user"
            )
        return user.is_authenticated and (
            user.is_superuser
            or (user.role == "ADMINISTRATOR" and user.has_perm(f"accounts.{verb}_user"))
        )


class DirectorySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name")


class ApplicantDirectoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = DirectorySerializer
    pagination_class = Page20
    queryset = User.objects.filter(role="LEARNER", is_active=True)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        if self.request.user.role not in {"REGISTRAR", "ADMINISTRATOR"} or not staff_can(
            self.request.user, "change_learner"
        ):
            raise PermissionDenied("Learner Account lookup requires learner management permission.")
        query = self.request.query_params.get("search", "").strip()[:150]
        queryset = self.queryset
        if self.request.query_params.get("role"):
            queryset = queryset.filter(role=self.request.query_params["role"])
        return queryset.filter(
            Q(email__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
        )


class ManagedUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    code = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=128)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_superuser",
            "mfa_enabled",
            "password",
            "current_password",
            "code",
        )
        read_only_fields = ("id", "is_superuser", "mfa_enabled")

    def validate(self, attrs):
        actor = self.context["request"].user
        if actor.role == "REGISTRAR" and (
            self.instance or attrs.get("role", "LEARNER") not in REGISTRAR_ACCOUNT_ROLES
        ):
            raise PermissionDenied("Registrars may create learner and class adviser accounts only.")
        if any(
            key in self.initial_data
            for key in ["is_superuser", "is_staff", "groups", "user_permissions", "mfa_enabled"]
        ):
            raise ValidationError(
                "Privilege flags and permission groups cannot be changed through this endpoint."
            )
        if self.instance and self.instance.pk == actor.pk:
            raise ValidationError(
                "Manage your password and MFA from Security. "
                "Another administrator must change your role or status."
            )
        if not actor.is_superuser and (
            attrs.get("role") == "ADMINISTRATOR"
            or (
                self.instance
                and (self.instance.role == "ADMINISTRATOR" or self.instance.is_superuser)
            )
        ):
            raise PermissionDenied("Only a technical superuser can manage administrator accounts.")
        if self.instance and self.instance.is_superuser:
            raise PermissionDenied(
                "Technical superusers are managed through technical administration."
            )
        if (
            self.instance
            and self.instance.role == "LEARNER"
            and attrs.get("role", "LEARNER") != "LEARNER"
            and self.instance.learners.exists()
        ):
            raise ValidationError(
                {"role": "An account with linked learners must remain a learner."}
            )
        if self.instance and "password" in attrs:
            raise ValidationError(
                "Use the audited account recovery procedure; "
                "passwords cannot be silently replaced here."
            )
        if not self.instance:
            password = attrs.get("password", "")
            candidate = User(
                email=attrs.get("email", ""),
                first_name=attrs.get("first_name", ""),
                last_name=attrs.get("last_name", ""),
            )
            try:
                validate_password(password, candidate)
            except DjangoValidationError as exc:
                raise ValidationError({"password": exc.messages}) from exc
        return attrs


class ManagedUserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = User.objects.all()
    serializer_class = ManagedUserSerializer
    permission_classes = [UserAdministrationPermission]
    pagination_class = Page20
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        query = self.request.query_params.get("search", "").strip()[:150]
        queryset = self.queryset
        if getattr(self.request.user, "role", None) == "REGISTRAR":
            queryset = queryset.filter(role__in=REGISTRAR_ACCOUNT_ROLES, is_superuser=False)
        if self.request.query_params.get("role"):
            queryset = queryset.filter(role=self.request.query_params["role"])
        return ordered(
            queryset.filter(
                Q(email__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            ),
            self.request.query_params,
            {"email": "email", "role": "role", "active": "is_active", "mfa": "mfa_enabled"},
            "email",
        )

    def perform_create(self, serializer):
        self._save(serializer)

    def perform_update(self, serializer):
        self._save(serializer)

    def _save(self, serializer):
        request = self.request
        limit_attempts(request, str(request.user.pk), "user-administration")
        with transaction.atomic():
            actor = User.objects.select_for_update().get(pk=request.user.pk)
            require_password(actor, serializer.validated_data.pop("current_password", ""))
            if actor.mfa_enabled and not verify_factor(
                actor, serializer.validated_data.get("code", "")
            ):
                raise ValidationError({"code": "Invalid or already-used authentication code."})
            serializer.validated_data.pop("code", None)
            creating = serializer.instance is None
            if creating:
                password = serializer.validated_data.pop("password")
                user = User(**serializer.validated_data)
                user.set_password(password)
            else:
                user = User.objects.select_for_update().get(pk=serializer.instance.pk)
                # Revalidate against locked state before changing roles or account status.
                serializer.instance = user
                serializer.validate(serializer.validated_data)
                for key, value in serializer.validated_data.items():
                    setattr(user, key, value)
                user.security_version += 1
            user.save()
            role_groups = Group.objects.filter(name__in=UserRole.values)
            user.groups.remove(*role_groups)
            group = Group.objects.filter(name=user.role).first()
            if group:
                user.groups.add(group)
            serializer.instance = user
            record_audit_event(
                action="CREATE_USER" if creating else "UPDATE_USER",
                entity="User",
                entity_id=user.pk,
                user=actor,
                request=request,
                metadata={"role": user.role, "is_active": user.is_active},
            )


class DashboardSerializer(serializers.Serializer):
    learners = serializers.IntegerField(allow_null=True)
    applications = serializers.IntegerField(allow_null=True)
    submitted = serializers.IntegerField(allow_null=True)
    documents = serializers.IntegerField(allow_null=True)
    reviews = serializers.IntegerField(allow_null=True)
    active_periods = serializers.IntegerField()
    users = serializers.IntegerField(allow_null=True)
    audit_events = serializers.IntegerField(allow_null=True)


class DashboardView(APIView):
    @extend_schema(responses=DashboardSerializer)
    def get(self, request):
        user = request.user
        applicant = user.role == "LEARNER"
        learners = Learner.objects.filter(owner=user) if applicant else Learner.objects.all()
        applications = (
            Application.objects.filter(learner__owner=user)
            if applicant
            else Application.objects.all()
        )
        documents = (
            DocumentSubmission.objects.filter(application__learner__owner=user)
            if applicant
            else DocumentSubmission.objects.all()
        )
        review_count = (
            DocumentReview.objects.filter(document__in=documents).count()
            if applicant or staff_can(user, "view_documentreview")
            else None
        )

        def count(qs, permission):
            return qs.count() if applicant or staff_can(user, permission) else None

        return Response(
            {
                "learners": count(learners, "view_learner"),
                "applications": count(applications, "view_application"),
                "submitted": count(applications.filter(status="SUBMITTED"), "view_application"),
                "documents": count(documents, "view_documentsubmission"),
                "reviews": review_count,
                "active_periods": AdmissionPeriod.objects.filter(is_active=True).count(),
                "users": User.objects.count()
                if user.is_superuser
                or (user.role == "ADMINISTRATOR" and user.has_perm("accounts.view_user"))
                else None,
                "audit_events": AuditEvent.objects.count()
                if user.is_superuser
                or (user.role == "ADMINISTRATOR" and user.has_perm("audit.view_auditevent"))
                else None,
            }
        )


class SystemSerializer(serializers.Serializer):
    database = serializers.CharField()
    blockchain_enabled = serializers.BooleanField()
    blockchain_integration = serializers.CharField()
    debug = serializers.BooleanField()
    mfa_encryption_configured = serializers.BooleanField()


class SystemView(APIView):
    @extend_schema(responses=SystemSerializer)
    def get(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied("Technical superuser access required.")
        return Response(
            {
                "database": settings.DATABASES["default"]["ENGINE"].rsplit(".", 1)[-1],
                "blockchain_enabled": configuration()["enabled"],
                "blockchain_integration": "EVM integrity registry",
                "debug": settings.DEBUG,
                "mfa_encryption_configured": bool(settings.MFA_ENCRYPTION_KEY),
            }
        )


class AccessPolicySerializer(serializers.Serializer):
    user = serializers.UUIDField()
    permissions = serializers.ListField(child=serializers.IntegerField(min_value=1))
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    code = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=128)
    reason = serializers.CharField(max_length=2000)


class AccessPolicyView(APIView):
    """Custom superadministrator page; never exposes Django administration."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from django.contrib.auth.models import Permission

        if not request.user.is_superuser:
            raise PermissionDenied("Superadministrator access required.")
        return Response(
            {
                "permissions": list(
                    Permission.objects.filter(
                        content_type__app_label__in=[
                            "accounts",
                            "admissions",
                            "audit",
                            "blockchain_records",
                        ]
                    ).values("id", "name", "codename", "content_type__app_label")
                ),
                "users": [
                    {
                        "id": str(user.pk),
                        "email": user.email,
                        "permissions": list(user.user_permissions.values_list("pk", flat=True)),
                        "role": user.role,
                        "is_superuser": user.is_superuser,
                    }
                    for user in User.objects.all()
                ],
            }
        )

    @extend_schema(request=AccessPolicySerializer, responses={204: None})
    def post(self, request):
        from django.contrib.auth.models import Permission

        if not request.user.is_superuser:
            raise PermissionDenied("Superadministrator access required.")
        serializer = AccessPolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not data["reason"].strip():
            raise ValidationError({"reason": "Explain the access change."})
        limit_attempts(request, str(request.user.pk), "access-policy")
        with transaction.atomic():
            users = {
                u.pk: u
                for u in User.objects.select_for_update()
                .filter(pk__in=[request.user.pk, data["user"]])
                .order_by("pk")
            }
            actor = users[request.user.pk]
            target = users.get(data["user"])
            require_password(actor, data["current_password"])
            if actor.mfa_enabled and not verify_factor(actor, data.get("code", "")):
                raise ValidationError({"code": "Invalid or already-used authentication code."})
            if not target or target.is_superuser or target.pk == actor.pk:
                raise ValidationError(
                    "Choose a non-superadministrator account other than yourself."
                )
            permissions = Permission.objects.filter(
                pk__in=data["permissions"],
                content_type__app_label__in=[
                    "accounts",
                    "admissions",
                    "audit",
                    "blockchain_records",
                ],
            )
            if permissions.count() != len(set(data["permissions"])):
                raise ValidationError({"permissions": "Unknown or unsupported permission."})
            old = list(target.user_permissions.values_list("pk", flat=True))
            target.user_permissions.set(permissions)
            target.security_version += 1
            target.save(update_fields=["security_version"])
            record_audit_event(
                action="UPDATE_ACCESS_POLICY",
                entity="User",
                entity_id=target.pk,
                user=actor,
                request=request,
                metadata={
                    "old_permissions": old,
                    "new_permissions": data["permissions"],
                    "reason": data["reason"],
                },
            )
        return Response(status=204)
