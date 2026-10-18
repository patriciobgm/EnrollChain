import secrets
from datetime import timedelta

import pyotp
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .security import cipher, limit_attempts, require_password, security_audit, verify_factor
from .serializers import SecurityActionSerializer, SecurityResultSerializer


class SecurityView(APIView):
    @extend_schema(responses=SecurityResultSerializer)
    def get(self, request):
        response = Response(
            {
                "enabled": request.user.mfa_enabled,
                "recovery_codes_remaining": len(request.user.recovery_codes),
            }
        )
        response["Cache-Control"] = "no-store"
        return response

    @extend_schema(request=SecurityActionSerializer, responses=SecurityResultSerializer)
    def post(self, request):
        serializer = SecurityActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        limit_attempts(request, str(request.user.pk), "security")
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            require_password(user, data["password"])
            action = data["action"]
            result = {}
            if action == "enroll":
                if user.mfa_enabled:
                    raise ValidationError("MFA is already enabled.")
                secret = pyotp.random_base32()
                user.mfa_pending_secret = cipher().encrypt(secret.encode()).decode()
                user.mfa_pending_at = timezone.now()
                result = {
                    "secret": secret,
                    "provisioning_uri": pyotp.TOTP(secret).provisioning_uri(
                        user.email, issuer_name="EnrollChain"
                    ),
                }
            elif action == "confirm":
                if (
                    user.mfa_enabled
                    or not user.mfa_pending_at
                    or timezone.now() - user.mfa_pending_at > timedelta(minutes=10)
                ):
                    raise ValidationError("Enrollment expired or already completed. Start again.")
                user.mfa_secret = user.mfa_pending_secret
                user.mfa_last_step = -1
                if not verify_factor(user, data.get("code", "")):
                    raise ValidationError({"code": "Invalid authentication code."})
                from django.contrib.auth.hashers import make_password

                codes = [secrets.token_hex(8) for _ in range(8)]
                user.recovery_codes = [make_password(code) for code in codes]
                user.mfa_enabled = True
                user.mfa_pending_secret = ""
                user.mfa_pending_at = None
                user.security_version += 1
                result = {
                    "recovery_codes": codes,
                    "detail": "MFA enabled. Save these one-use recovery codes and sign in again.",
                }
            else:
                if user.mfa_enabled and not verify_factor(user, data.get("code", "")):
                    raise ValidationError({"code": "Invalid or already-used authentication code."})
                if action == "disable":
                    user.mfa_enabled = False
                    user.mfa_secret = user.mfa_pending_secret = ""
                    user.mfa_pending_at = None
                    user.mfa_last_step = -1
                    user.recovery_codes = []
                elif action == "change_password":
                    password = data.get("new_password", "")
                    try:
                        validate_password(password, user)
                    except DjangoValidationError as exc:
                        raise ValidationError({"new_password": exc.messages}) from exc
                    user.set_password(password)
                user.security_version += 1
                result = {
                    "detail": "Security settings updated. All sessions revoked; sign in again."
                }
            user.save()
            security_audit("SECURITY_" + action.upper(), user, request)
        response = Response(result)
        response["Cache-Control"] = "no-store"
        return response
