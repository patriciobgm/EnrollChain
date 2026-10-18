# ruff: noqa: F811
import json
from io import StringIO

import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.admissions.models import Application, DocumentSubmission, Learner
from tests.test_admissions import create_application, setup, upload  # noqa: F401

pytestmark = pytest.mark.django_db


def test_scoped_demo_reset_preserves_staff_and_unrelated_records(setup, tmp_path, settings):
    settings.CLIENT_TEST_MODE = True
    client, owner, other, learner, _ = setup
    owner.email = "applicant@enrollchain.test"
    owner.save()
    learner.first_name, learner.last_name = "Ana", "Cruz"
    learner.save()
    User.objects.create_user(email="applicant2@enrollchain.test", password="retired-test")
    staff = User.objects.create_user(
        email="registrar@example.com", role="REGISTRAR", password="preserved-test"
    )
    original_hash = staff.password
    application = create_application(setup)
    rule = client.get(f"/api/v1/applications/{application['id']}/requirements/").data[0]
    document = upload(client, application["id"], rule["id"])
    assert document.status_code == 201
    saved_file = DocumentSubmission.objects.get(pk=document.data["id"]).file
    storage, path = saved_file.storage, saved_file.name
    credentials = tmp_path / "accounts.json"
    credentials.write_text(
        json.dumps([{"email": "learner@enrollchain.test", "password": "new-test-password"}])
    )
    call_command("setup_admissions_roles", stdout=StringIO())
    call_command("reset_learner_demo", accounts_file=str(credentials), stdout=StringIO())
    assert Learner.objects.filter(pk=learner.pk).exists()
    assert storage.exists(path)
    call_command(
        "reset_learner_demo", accounts_file=str(credentials), apply=True, stdout=StringIO()
    )
    assert not Learner.objects.filter(pk=learner.pk).exists()
    assert not Application.objects.filter(pk=application["id"]).exists()
    assert not storage.exists(path)
    assert not User.objects.filter(
        email__in=["applicant@enrollchain.test", "applicant2@enrollchain.test"]
    ).exists()
    staff.refresh_from_db()
    assert staff.password == original_hash
    assert User.objects.filter(pk=other.pk).exists()
    fresh = User.objects.get(email="learner@enrollchain.test")
    assert fresh.role == "LEARNER"
    assert fresh.check_password("new-test-password")
    assert fresh.groups.filter(name="LEARNER").exists()
    assert not Learner.objects.filter(owner=fresh).exists()
    call_command(
        "reset_learner_demo", accounts_file=str(credentials), apply=True, stdout=StringIO()
    )
    assert User.objects.filter(email=fresh.email).count() == 1


def test_local_demo_accounts_sync_without_touching_learner_data(setup, tmp_path, settings):
    settings.DEBUG = True
    settings.CLIENT_TEST_MODE = False
    _, owner, _, learner, _ = setup
    owner.email = "learner@enrollchain.test"
    owner.mfa_enabled = True
    owner.save()
    counts = (Learner.objects.count(), Application.objects.count())
    original_version = owner.security_version
    credentials = tmp_path / "accounts.json"
    credentials.write_text(
        json.dumps(
            [
                {
                    "email": owner.email,
                    "role": "LEARNER",
                    "superuser": False,
                    "password": "synced-test-password",
                },
                {
                    "email": "superadmin@enrollchain.test",
                    "role": "ADMINISTRATOR",
                    "superuser": True,
                    "password": "superadmin-test-password",
                },
            ]
        )
    )
    call_command("setup_admissions_roles", stdout=StringIO())
    call_command(
        "seed_client_test",
        accounts_file=str(credentials),
        accounts_only=True,
        sync_existing=True,
        stdout=StringIO(),
    )
    owner.refresh_from_db()
    assert owner.check_password("synced-test-password")
    assert owner.mfa_enabled
    assert owner.security_version == original_version + 1
    learner.refresh_from_db()
    assert learner.owner_id == owner.pk
    assert counts == (Learner.objects.count(), Application.objects.count())
    admin = User.objects.get(email="superadmin@enrollchain.test")
    assert admin.is_superuser and admin.check_password("superadmin-test-password")
    call_command(
        "seed_client_test",
        accounts_file=str(credentials),
        accounts_only=True,
        sync_existing=True,
        stdout=StringIO(),
    )
    owner.refresh_from_db()
    assert owner.security_version == original_version + 1
    settings.DEBUG = False
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command(
            "seed_client_test",
            accounts_file=str(credentials),
            accounts_only=True,
            sync_existing=True,
        )
