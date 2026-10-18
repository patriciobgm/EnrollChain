import time
from datetime import timedelta
from unittest.mock import patch

import pyotp
import pytest
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.security import cipher, tokens_for
from apps.admissions.models import Application, DocumentSubmission, Requirement
from apps.audit.models import AuditEvent
from tests.test_admissions import create_application, grant, upload
from tests.test_admissions import setup as setup_fixture

setup = setup_fixture
pytestmark = pytest.mark.django_db
PASSWORD = "SafeTesting-Cedar-4907!"


@pytest.fixture
def identity(settings):
    settings.MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()
    user = User.objects.create_user(email="secure@example.test", password=PASSWORD)
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def enroll(client):
    return client.post(
        "/api/v1/accounts/security/", {"action": "enroll", "password": PASSWORD}, format="json"
    )


def enable(client):
    result = enroll(client)
    assert result.status_code == 200, result.data
    secret = result.data["secret"]
    confirmed = client.post(
        "/api/v1/accounts/security/",
        {"action": "confirm", "password": PASSWORD, "code": pyotp.TOTP(secret).now()},
        format="json",
    )
    assert confirmed.status_code == 200, confirmed.data
    return secret, confirmed.data["recovery_codes"]


def login(client, code=""):
    return client.post(
        "/api/v1/auth/token/",
        {"email": "secure@example.test", "password": PASSWORD, "code": code},
        format="json",
    )


def test_mfa_enrollment_encryption_and_old_session_revocation(identity):
    client, user = identity
    old = tokens_for(user)
    secret, codes = enable(client)
    user.refresh_from_db()
    assert user.mfa_enabled and user.mfa_secret != secret
    assert cipher().decrypt(user.mfa_secret.encode()).decode() == secret
    assert len(codes) == 8 and all(code not in user.recovery_codes for code in codes)
    assert not user.mfa_pending_secret
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer " + old["access"])
    assert api.get("/api/v1/accounts/me/").status_code == 401
    assert api.post("/api/v1/auth/token/refresh/", {"refresh": old["refresh"]}).status_code == 401
    assert AuditEvent.objects.filter(action="SECURITY_CONFIRM").exists()
    assert not any(
        secret in str(item) or codes[0] in str(item)
        for item in AuditEvent.objects.values("metadata")
    )


def test_mfa_login_requires_factor_and_recovery_is_one_use(identity):
    client, user = identity
    secret, codes = enable(client)
    api = APIClient()
    assert login(api).status_code == 401
    user.refresh_from_db()
    assert login(api, pyotp.TOTP(secret).at(user.mfa_last_step * 30)).status_code == 401
    valid = login(api, codes[0])
    assert valid.status_code == 200
    assert login(api, codes[0]).status_code == 401
    assert "access" not in login(api, "wrong").data
    api.credentials(HTTP_AUTHORIZATION="Bearer " + valid.data["access"])
    assert api.get("/api/v1/accounts/me/").data["mfa_enabled"]
    assert (
        api.post("/api/v1/auth/token/refresh/", {"refresh": valid.data["refresh"]}).status_code
        == 200
    )
    user.refresh_from_db()
    assert len(user.recovery_codes) == 7


def test_totp_success_and_replay_prevention(identity):
    client, _ = identity
    secret, _ = enable(client)
    future = int(time.time()) + 60
    api = APIClient()
    with patch("apps.accounts.security.time.time", return_value=future):
        code = pyotp.TOTP(secret).at(future)
        assert login(api, code).status_code == 200
        assert login(api, code).status_code == 401


def test_expired_enrollment_and_wrong_password_do_not_enable_mfa(identity):
    client, user = identity
    response = enroll(client)
    User.objects.filter(pk=user.pk).update(mfa_pending_at=timezone.now() - timedelta(minutes=11))
    result = client.post(
        "/api/v1/accounts/security/",
        {
            "action": "confirm",
            "password": PASSWORD,
            "code": pyotp.TOTP(response.data["secret"]).now(),
        },
        format="json",
    )
    assert result.status_code == 400
    assert (
        client.post(
            "/api/v1/accounts/security/", {"action": "enroll", "password": "wrong"}, format="json"
        ).status_code
        == 400
    )
    user.refresh_from_db()
    assert not user.mfa_enabled


def test_mfa_disable_requires_password_and_factor(identity):
    client, user = identity
    _, codes = enable(client)
    assert (
        client.post(
            "/api/v1/accounts/security/", {"action": "disable", "password": PASSWORD}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/accounts/security/",
            {"action": "disable", "password": PASSWORD, "code": codes[0]},
            format="json",
        ).status_code
        == 200
    )
    user.refresh_from_db()
    assert not user.mfa_enabled and not user.mfa_secret and not user.recovery_codes


def test_password_change_revokes_sessions_and_validates_password(identity):
    client, user = identity
    before = tokens_for(user)
    assert (
        client.post(
            "/api/v1/accounts/security/",
            {"action": "change_password", "password": PASSWORD, "new_password": "123"},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/accounts/security/",
            {
                "action": "change_password",
                "password": PASSWORD,
                "new_password": "New-strong-password-783!",
            },
            format="json",
        ).status_code
        == 200
    )
    api = APIClient()
    assert (
        api.post("/api/v1/auth/token/refresh/", {"refresh": before["refresh"]}).status_code == 401
    )
    user.refresh_from_db()
    assert user.check_password("New-strong-password-783!")


def test_failed_login_logged_and_database_throttled(identity):
    api = APIClient()
    payload = {"email": "missing@example.test", "password": "wrong"}
    for _ in range(10):
        assert api.post("/api/v1/auth/token/", payload).status_code == 401
    assert api.post("/api/v1/auth/token/", payload).status_code == 429
    assert AuditEvent.objects.filter(action="LOGIN_FAILED").count() == 10


def test_technical_django_admin_is_not_exposed(identity):
    client, user = identity
    user.is_superuser = user.is_staff = True
    user.save()
    assert client.get("/admin/").status_code == 404
    assert (
        client.post("/admin/login/", {"username": user.email, "password": PASSWORD}).status_code
        == 404
    )


def test_preview_scoped_private_and_audited(setup):
    client, _, other, _, _ = setup
    app = create_application(setup)
    doc = upload(client, app["id"], Requirement.objects.first().pk).data
    url = f"/api/v1/documents/{doc['id']}/preview/"
    response = client.get(url)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"].startswith("inline;")
    assert "no-store" in response["Cache-Control"]
    assert b"%PDF" in b"".join(response.streaming_content)
    assert AuditEvent.objects.filter(action="PREVIEW_DOCUMENT", entity_id=doc["id"]).exists()
    client.force_authenticate(other)
    assert client.get(url).status_code == 404
    client.force_authenticate(None)
    assert client.get(url).status_code == 401


def test_registrar_preview_requires_permission(setup):
    client, _, _, _, _ = setup
    app = create_application(setup)
    doc = upload(client, app["id"], Requirement.objects.first().pk).data
    registrar = User.objects.create_user(email="preview@example.test", role="REGISTRAR")
    client.force_authenticate(registrar)
    url = f"/api/v1/documents/{doc['id']}/preview/"
    assert client.get(url).status_code == 403
    grant(registrar, "view_documentsubmission")
    response = client.get(url)
    assert response.status_code == 200
    b"".join(response.streaming_content)


def test_link_preserves_submitted_data_and_blocks_reassignment(setup):
    client, owner, other, learner, _ = setup
    app = create_application(setup)
    for req in Requirement.objects.all():
        upload(client, app["id"], req.pk)
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    learner.owner = None
    learner.save()
    staff = User.objects.create_user(email="link@example.test", role="REGISTRAR")
    grant(staff, "change_learner", "view_learner")
    before = DocumentSubmission.objects.count()
    client.force_authenticate(staff)
    url = f"/api/v1/learners/{learner.pk}/link-applicant/"
    result = client.post(url, {"owner": str(owner.pk)}, format="json")
    assert result.status_code == 200, result.data
    assert result.data["owner_email"] == owner.email
    assert Application.objects.get(pk=app["id"]).status == "SUBMITTED"
    assert DocumentSubmission.objects.count() == before
    assert client.post(url, {"owner": str(other.pk)}, format="json").status_code == 400
    assert AuditEvent.objects.filter(action="LINK_LEARNER").exists()
    client.force_authenticate(owner)
    assert client.get(f"/api/v1/applications/{app['id']}/").status_code == 200
    client.force_authenticate(other)
    assert client.get(f"/api/v1/applications/{app['id']}/").status_code == 404
    assert client.post(url, {"owner": str(other.pk)}, format="json").status_code == 403
    assert client.get("/api/v1/accounts/directory/").status_code == 403


def test_audit_read_only_admin_permissions(identity):
    client, user = identity
    assert client.get("/api/v1/audit-events/").status_code == 403
    user.role = "ADMINISTRATOR"
    user.save()
    assert client.get("/api/v1/audit-events/").status_code == 403
    user.user_permissions.add(
        Permission.objects.get(content_type__app_label="audit", codename="view_auditevent")
    )
    client.force_authenticate(User.objects.get(pk=user.pk))
    event = AuditEvent.objects.create(action="TEST", entity="User", user=user)
    result = client.get("/api/v1/audit-events/?action=TEST")
    assert result.status_code == 200 and result.data["count"] == 1
    assert (
        client.patch(f"/api/v1/audit-events/{event.pk}/", {"action": "ALTERED"}).status_code == 405
    )
    assert client.delete(f"/api/v1/audit-events/{event.pk}/").status_code == 405
    assert client.get("/api/v1/audit-events/?from=2026-99-99").status_code == 400


def test_user_management_no_self_promotion_and_deactivation_revokes(identity):
    client, user = identity
    call_command("setup_admissions_roles")
    user.role = "ADMINISTRATOR"
    user.save()
    from django.contrib.auth.models import Group

    user.groups.add(Group.objects.get(name="ADMINISTRATOR"))
    target = User.objects.create_user(email="target@example.test", password=PASSWORD)
    before = tokens_for(target)
    url = f"/api/v1/accounts/users/{target.pk}/"
    assert client.patch(url, {"is_active": False}, format="json").status_code == 400
    assert (
        client.patch(
            url, {"role": "ADMINISTRATOR", "current_password": PASSWORD}, format="json"
        ).status_code
        == 403
    )
    assert (
        client.patch(
            url, {"is_superuser": True, "current_password": PASSWORD}, format="json"
        ).status_code
        == 400
    )
    result = client.patch(url, {"is_active": False, "current_password": PASSWORD}, format="json")
    assert result.status_code == 200, result.data
    target.refresh_from_db()
    assert not target.is_active and not target.is_superuser
    assert (
        APIClient().post("/api/v1/auth/token/refresh/", {"refresh": before["refresh"]}).status_code
        == 401
    )
    assert client.get("/api/v1/accounts/system/").status_code == 403
    assert AuditEvent.objects.filter(action="UPDATE_USER").exists()


def test_dashboard_does_not_leak_other_applicants(setup):
    client, _, other, _, _ = setup
    create_application(setup)
    result = client.get("/api/v1/accounts/dashboard/")
    assert result.status_code == 200 and result.data["applications"] == 1
    assert result.data["users"] is None and result.data["audit_events"] is None
    client.force_authenticate(other)
    assert client.get("/api/v1/accounts/dashboard/").data["applications"] == 0


def test_password_reset_outside_security_view_revokes_tokens(identity):
    _, user = identity
    tokens = tokens_for(user)
    user.set_password("Reset-password-Cedar-9103!")
    user.save()
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
    assert api.get("/api/v1/accounts/me/").status_code == 401
    assert (
        api.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}).status_code == 401
    )
