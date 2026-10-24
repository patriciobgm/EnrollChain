import pytest
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db
PASSWORD = "Test-Registrar-Cedar-9058!"


@pytest.fixture
def registrar():
    call_command("setup_admissions_roles")
    user = User.objects.create_user(
        email="registrar@test.example", role="REGISTRAR", password=PASSWORD
    )
    user.groups.add(Group.objects.get(name="REGISTRAR"))
    client = APIClient()
    client.force_authenticate(user)
    return client, user


@pytest.mark.parametrize("role", ["LEARNER", "CLASS_ADVISER"])
def test_registrar_creates_allowed_account_with_role_group_and_audit(registrar, role):
    client, actor = registrar
    result = client.post(
        "/api/v1/accounts/users/",
        {
            "email": f"{role.lower()}@test.example",
            "role": role,
            "password": "New-Account-Cedar-6047!",
            "current_password": PASSWORD,
        },
        format="json",
    )
    assert result.status_code == 201, result.data
    user = User.objects.get(pk=result.data["id"])
    assert user.role == role and user.groups.filter(name=role).exists()
    assert user.check_password("New-Account-Cedar-6047!")
    assert not user.is_superuser
    assert AuditEvent.objects.filter(
        action="CREATE_USER", user=actor, entity_id=str(user.pk)
    ).exists()
    assert "password" not in result.data


@pytest.mark.parametrize("role", ["REGISTRAR", "ADMINISTRATOR", "GUIDANCE_OFFICER"])
def test_registrar_cannot_provision_other_staff_roles(registrar, role):
    client, _ = registrar
    response = client.post(
        "/api/v1/accounts/users/",
        {
            "email": "blocked@test.example",
            "role": role,
            "password": "New-Account-Cedar-6047!",
            "current_password": PASSWORD,
        },
        format="json",
    )
    assert response.status_code == 403
    assert not User.objects.filter(email="blocked@test.example").exists()


def test_registrar_directory_scope_and_no_account_edits(registrar):
    client, actor = registrar
    teacher = User.objects.create_user(email="teacher@test.example", role="CLASS_ADVISER")
    admin = User.objects.create_user(email="admin@test.example", role="ADMINISTRATOR")
    result = client.get("/api/v1/accounts/users/")
    assert {row["id"] for row in result.data["results"]} == {str(teacher.pk)}
    assert client.get(f"/api/v1/accounts/users/{admin.pk}/").status_code == 404
    actor.user_permissions.add(
        Permission.objects.get(codename="change_user", content_type__app_label="accounts")
    )
    assert (
        client.patch(
            f"/api/v1/accounts/users/{teacher.pk}/",
            {"is_active": False, "current_password": PASSWORD},
            format="json",
        ).status_code
        == 403
    )
    actor.groups.clear()
    client.force_authenticate(User.objects.get(pk=actor.pk))
    assert client.get("/api/v1/accounts/users/").status_code == 403


def test_registrar_creation_requires_current_password_and_rejects_privilege_flags(registrar):
    client, _ = registrar
    payload = {
        "email": "guarded@test.example",
        "role": "LEARNER",
        "password": "New-Account-Cedar-6047!",
        "current_password": "wrong",
    }
    assert client.post("/api/v1/accounts/users/", payload, format="json").status_code == 400
    payload.update(current_password=PASSWORD, is_superuser=True)
    assert client.post("/api/v1/accounts/users/", payload, format="json").status_code == 400
    assert not User.objects.filter(email=payload["email"]).exists()


def test_superadmins_are_excluded_from_managed_directory_even_for_superadmin():
    actor = User.objects.create_superuser(email="technical@test.example", password=PASSWORD)
    learner = User.objects.create_user(email="visible@test.example", role="LEARNER")
    client = APIClient()
    client.force_authenticate(actor)
    result = client.get("/api/v1/accounts/users/")
    assert result.status_code == 200
    assert result.data["count"] == 1
    assert result.data["results"][0]["id"] == str(learner.pk)
    assert client.get("/api/v1/accounts/users/?search=technical").data["count"] == 0
    assert client.get(f"/api/v1/accounts/users/{actor.pk}/").status_code == 404
