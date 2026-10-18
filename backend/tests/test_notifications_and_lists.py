# ruff: noqa: F811
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Notification
from apps.admissions.models import Application
from tests.test_admissions import create_application, setup, upload  # noqa: F401
from tests.test_early_enrollment import school  # noqa: F401

pytestmark = pytest.mark.django_db


def test_notification_ownership_read_all_and_delete(school):
    client, owner, other, _, _ = school[0]
    own = Notification.objects.create(
        recipient=owner, title="Document Verified", link="/applications"
    )
    foreign = Notification.objects.create(recipient=other, title="Private", link="/applications")
    assert client.get("/api/v1/accounts/notifications/count/").data == {"unread": 1}
    assert client.post(f"/api/v1/accounts/notifications/{foreign.pk}/read/").status_code == 404
    assert client.delete(f"/api/v1/accounts/notifications/{foreign.pk}/").status_code == 404
    assert client.post("/api/v1/accounts/notifications/read-all/").data == {"updated": 1}
    foreign.refresh_from_db()
    assert foreign.read_at is None
    assert client.delete("/api/v1/accounts/notifications/clear-read/").data == {"deleted": 1}
    assert not Notification.objects.filter(pk=own.pk).exists()
    assert Notification.objects.filter(pk=foreign.pk).exists()
    assert APIClient().get("/api/v1/accounts/notifications/").status_code == 401


def test_review_queue_groups_documents_and_notifies_owner(school):
    client, owner, _, _, _ = school[0]
    registrar = school[1]["REGISTRAR"][1]
    app = create_application(school[0])
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    entries = client.get(f"/api/v1/applications/{app['id']}/requirements/").data
    documents = [upload(client, app["id"], entry["id"]).data for entry in entries]
    response = registrar.get(
        "/api/v1/documents/review-queue/?group=application&ordering=-documents"
    )
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["document_count"] == len(documents)
    assert "documents" not in response.data["results"][0]
    assert client.get("/api/v1/documents/review-queue/?group=application").status_code == 403
    assert (
        registrar.post(
            f"/api/v1/documents/{documents[0]['id']}/review/",
            {"decision": "VERIFIED"},
            format="json",
        ).status_code
        == 200
    )
    notice = Notification.objects.filter(recipient=owner, title="Document Verified").get()
    assert str(app["id"]) in notice.link
    assert Notification.objects.filter(recipient=school[1]["REGISTRAR"][0]).exists()


def test_sorting_is_validated_and_history_keeps_previous_period(school):
    client = school[0][0]
    app = create_application(school[0])
    reg = school[1]["REGISTRAR"][1]
    assert reg.get("/api/v1/learners/?ordering=-name").status_code == 200
    assert reg.get("/api/v1/learners/?ordering=religion").status_code == 400
    assert client.get("/api/v1/enrollments/?ordering=-stage").status_code == 200
    assert client.get("/api/v1/enrollments/?archive=false").data["count"] == 1
    period = school[0][4]
    period.is_active = False
    period.save()
    assert client.get("/api/v1/enrollments/?archive=false").data["count"] == 0
    history = client.get("/api/v1/enrollments/?archive=true")
    assert history.data["results"][0]["id"] == app["id"]
    assert Application.objects.filter(pk=app["id"]).exists()


def test_grade_and_classification_filters_reuse_existing_enrollment(school):
    app = create_application(school[0], classification="RETURNING", grade_level=12)
    reg = school[1]["REGISTRAR"][1]
    matching = reg.get("/api/v1/enrollments/?classification=RETURNING&grade_level=12")
    assert matching.status_code == 200
    assert [row["id"] for row in matching.data["results"]] == [app["id"]]
    assert reg.get("/api/v1/enrollments/?classification=NEW&grade_level=12").data["count"] == 0
    assert (
        reg.get("/api/v1/enrollments/?classification=RETURNING&grade_level=11").data["count"] == 0
    )
    assert Application.objects.get(pk=app["id"]).get_classification_display() == "Balik-Aral"
