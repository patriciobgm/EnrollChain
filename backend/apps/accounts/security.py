"""Authentication controls shared by JWT and the technical Django admin login."""

import base64
import hashlib
import secrets
import time
from datetime import timedelta

import pyotp
from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.exceptions import AuthenticationFailed, Throttled, ValidationError
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

from apps.audit.services import record_audit_event

from .models import LoginWindow, User


def cipher():
    key = settings.MFA_ENCRYPTION_KEY
    if not key:
        if not settings.DEBUG:
            raise DjangoValidationError("MFA_ENCRYPTION_KEY must be configured.")
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def security_audit(action, user, request):
    record_audit_event(
        action=action, entity="User", entity_id=user.pk if user else "", user=user, request=request
    )


def limit_attempts(request, identity, purpose="login"):
    # Stored in the database: shared across web workers, unlike a local-memory cache.
    # Count attempts, including successes, so unknown accounts follow the same path.
    now = timezone.now()
    ip = request.META.get("REMOTE_ADDR", "unknown")
    for raw, limit in [(f"ip:{ip}", 100), (f"account:{identity.lower()}", 10)]:
        key = hashlib.sha256(f"{purpose}:{raw}".encode()).hexdigest()
        with transaction.atomic():
            LoginWindow.objects.get_or_create(key=key, defaults={"started_at": now})
            window = LoginWindow.objects.select_for_update().get(pk=key)
            if now - window.started_at >= timedelta(minutes=15):
                window.started_at, window.attempts = now, 0
            if window.attempts >= limit:
                raise Throttled(detail="Too many attempts. Try again later.", wait=900)
            window.attempts += 1
            window.save(update_fields=["started_at", "attempts"])


def verify_factor(user, code):
    """Caller must lock User and commit even on failure if attempts are changed elsewhere."""
    if not code or not user.mfa_secret:
        return False
    code = code.strip().replace(" ", "")
    otp = pyotp.TOTP(cipher().decrypt(user.mfa_secret.encode()).decode())
    step = int(time.time()) // 30
    for candidate in [step - 1, step, step + 1]:
        if candidate > user.mfa_last_step and secrets.compare_digest(otp.at(candidate * 30), code):
            user.mfa_last_step = candidate
            user.save(update_fields=["mfa_last_step"])
            return True
    for index, hashed in enumerate(user.recovery_codes):
        if check_password(code, hashed):
            user.recovery_codes = [
                value for i, value in enumerate(user.recovery_codes) if i != index
            ]
            user.save(update_fields=["recovery_codes"])
            return True
    return False


def authenticate_credentials(request, email, password, code=""):
    limit_attempts(request, email)
    with transaction.atomic():
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        if user is None:
            # Equalize the expensive password work for unknown accounts.
            make_password(password)
        valid = bool(user and user.is_active and user.check_password(password))
        if valid and user.mfa_enabled:
            if not code:
                raise AuthenticationFailed(
                    "Additional authentication required.", code="mfa_required"
                )
            valid = verify_factor(user, code)
    if not valid:
        security_audit("LOGIN_FAILED", user, request)
        raise AuthenticationFailed(
            "Unable to sign in. Check your email, password and authentication code."
        )
    security_audit("LOGIN", user, request)
    return user


def tokens_for(user):
    token = RefreshToken.for_user(user)
    token["security_version"] = user.security_version
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return {"refresh": str(token), "access": str(token.access_token)}


class SecurityJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if validated_token.get("security_version", 0) != user.security_version:
            raise AuthenticationFailed("Session revoked. Sign in again.")
        return user


class SecurityTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = RefreshToken(attrs["refresh"])
        user = User.objects.filter(pk=token["user_id"], is_active=True).first()
        if (
            not user
            or token.get("security_version", 0) != user.security_version
            or token.get(api_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password)
        ):
            raise AuthenticationFailed("Session revoked. Sign in again.")
        return super().validate(attrs)


def require_password(user, password):
    if not user.check_password(password):
        raise ValidationError({"password": "Current password is incorrect."})


class SecurityJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.security.SecurityJWTAuthentication"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
