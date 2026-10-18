import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class UserRole(models.TextChoices):
    LEARNER = "LEARNER", "Learner"
    GUIDANCE_OFFICER = "GUIDANCE_OFFICER", "Guidance Officer"
    CLASS_ADVISER = "CLASS_ADVISER", "Class Adviser"
    REGISTRAR = "REGISTRAR", "Registrar"
    ADMINISTRATOR = "ADMINISTRATOR", "Administrator"


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=24, choices=UserRole.choices, default=UserRole.LEARNER)
    security_version = models.PositiveIntegerField(default=0)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.TextField(blank=True)
    mfa_pending_secret = models.TextField(blank=True)
    mfa_pending_at = models.DateTimeField(null=True, blank=True)
    mfa_last_step = models.BigIntegerField(default=-1)
    recovery_codes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["email"]

    def _get_session_auth_hash(self, secret=None):
        from django.utils.crypto import salted_hmac

        return salted_hmac(
            "enrollchain.session",
            f"{self.password}:{self.security_version}",
            secret=secret,
            algorithm="sha256",
        ).hexdigest()

    def __str__(self):
        return self.email


class LoginWindow(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    started_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.key


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=160)
    link = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["recipient", "read_at", "created_at"])]

    def __str__(self):
        return self.title
