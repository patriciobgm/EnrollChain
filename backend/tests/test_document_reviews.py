import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.admissions.models import Application, DocumentReview, DocumentSubmission, Requirement
from apps.audit.models import AuditEvent
from tests.test_admissions import create_application, grant, upload
from tests.test_admissions import setup as setup_fixture

setup = setup_fixture

pytestmark = pytest.mark.django_db


@pytest.fixture
def submitted(setup):
    client = setup[0]
    app = create_application(setup)
    documents = [upload(client, app["id"], req.pk).data for req in Requirement.objects.all()]
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    registrar = User.objects.create_user(email="reviewer@example.test", role="REGISTRAR")
    grant(registrar, "view_documentsubmission", "view_documentreview", "review_document")
    staff = APIClient()
    staff.force_authenticate(registrar)
    return client, staff, registrar, app, documents


def decide(staff, document, decision="VERIFIED", remarks=""):
    return staff.post(
        f"/api/v1/documents/{document['id']}/review/",
        {"decision": decision, "remarks": remarks},
        format="json",
    )


def test_registrar_verification_and_audit(submitted):
    client, staff, registrar, app, documents = submitted
    result = decide(staff, documents[0], remarks="Reviewed the submitted record.")
    assert result.status_code == 200, result.data
    assert result.data["review_status"] == "VERIFIED"
    assert result.data["review"]["remarks"] == "Reviewed the submitted record."
    review = DocumentReview.objects.get(document_id=documents[0]["id"])
    assert review.reviewed_by == registrar
    assert AuditEvent.objects.filter(action="REVIEW_DOCUMENT", entity_id=review.pk).exists()
    checklist = client.get(f"/api/v1/applications/{app['id']}/requirements/").data
    requirement = next(row for row in checklist if row["id"] == documents[0]["requirement"])
    assert requirement["review_status"] == "VERIFIED" and not requirement["can_upload"]
    assert Application.objects.get(pk=app["id"]).status == "SUBMITTED"


@pytest.mark.parametrize(
    "role", ["APPLICANT", "ADMINISTRATOR", "GUIDANCE_OFFICER", "CLASS_ADVISER"]
)
def test_only_registrar_can_decide_even_with_permissions(submitted, role):
    _, client, _, _, documents = submitted
    user = User.objects.create_user(
        email=f"{role}@example.test", role=role, is_superuser=role == "ADMINISTRATOR"
    )
    grant(user, "view_documentsubmission", "view_documentreview", "review_document")
    client.force_authenticate(user)
    assert decide(client, documents[0]).status_code == 403
    assert not DocumentReview.objects.exists()


def test_registrar_without_permission_cannot_decide(submitted):
    _, client, _, _, documents = submitted
    user = User.objects.create_user(email="unassigned@example.test", role="REGISTRAR")
    grant(user, "view_documentsubmission")
    client.force_authenticate(user)
    assert decide(client, documents[0]).status_code == 403


@pytest.mark.parametrize("decision", ["REJECTED", "RESUBMISSION_REQUESTED"])
def test_feedback_required_for_negative_decisions(submitted, decision):
    _, staff, _, _, documents = submitted
    assert decide(staff, documents[0], decision, "  ").status_code == 400
    assert not DocumentReview.objects.exists()
    assert (
        decide(staff, documents[0], decision, "Please provide a legible copy.").status_code == 200
    )


def test_invalid_decision_and_excessive_remarks(submitted):
    _, staff, _, _, documents = submitted
    assert decide(staff, documents[0], "ADMITTED").status_code == 400
    assert decide(staff, documents[0], "VERIFIED", "x" * 2001).status_code == 400


def test_resubmission_is_targeted_and_preserves_version_history(submitted):
    client, staff, _, app, documents = submitted
    original = documents[0]
    response = decide(staff, original, "RESUBMISSION_REQUESTED", "Upload all pages.")
    assert response.status_code == 200
    assert upload(client, app["id"], documents[1]["requirement"]).status_code == 400
    replacement = upload(client, app["id"], original["requirement"])
    assert replacement.status_code == 201, replacement.data
    assert replacement.data["version"] == 2
    assert replacement.data["review_status"] == "PENDING"
    assert replacement.data["review"] is None
    assert upload(client, app["id"], original["requirement"]).status_code == 400
    assert (
        client.patch(f"/api/v1/applications/{app['id']}/", {"grade_level": 12}).status_code == 400
    )
    assert (
        DocumentSubmission.objects.filter(
            application_id=app["id"], requirement_id=original["requirement"]
        ).count()
        == 2
    )
    assert DocumentReview.objects.get(document_id=original["id"]).remarks == "Upload all pages."
    assert AuditEvent.objects.filter(
        action="RESUBMIT_DOCUMENT", entity_id=replacement.data["id"]
    ).exists()
    assert decide(staff, replacement.data).status_code == 200
    queue = staff.get("/api/v1/documents/review-queue/?status=ALL").data
    assert original["id"] not in [row["id"] for row in queue["results"]]
    assert replacement.data["id"] in [row["id"] for row in queue["results"]]
    history = client.get(f"/api/v1/documents/?application={app['id']}").data
    assert next(row for row in history if row["id"] == original["id"])["is_latest"] is False


def test_rejected_and_verified_documents_cannot_be_replaced(submitted):
    client, staff, _, app, documents = submitted
    assert decide(staff, documents[0], "REJECTED", "Incorrect record.").status_code == 200
    assert decide(staff, documents[1], "VERIFIED").status_code == 200
    for document in documents[:2]:
        assert upload(client, app["id"], document["requirement"]).status_code == 400


def test_cannot_review_twice_or_overwrite_review(submitted):
    _, staff, _, _, documents = submitted
    assert decide(staff, documents[0]).status_code == 200
    assert decide(staff, documents[0], "REJECTED", "Changed mind.").status_code == 400
    review = DocumentReview.objects.get(document_id=documents[0]["id"])
    review.remarks = "Changed"
    with pytest.raises(TypeError, match="immutable"):
        review.save()
    with pytest.raises(TypeError, match="immutable"):
        review.delete()
    with pytest.raises(IntegrityError), transaction.atomic():
        DocumentReview.objects.create(
            document=review.document, reviewed_by=review.reviewed_by, decision="VERIFIED"
        )


def test_old_version_and_draft_reviews_are_rejected(setup):
    client = setup[0]
    app = create_application(setup)
    original = upload(client, app["id"], Requirement.objects.first().pk).data
    user = User.objects.create_user(email="registrar@example.test", role="REGISTRAR")
    grant(user, "view_documentsubmission", "view_documentreview", "review_document")
    staff = APIClient()
    staff.force_authenticate(user)
    assert decide(staff, original).status_code == 400
    for req in Requirement.objects.all():
        upload(client, app["id"], req.pk)
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    assert decide(staff, original).status_code == 400
    queue = staff.get("/api/v1/documents/review-queue/").data
    assert original["id"] not in [row["id"] for row in queue["results"]]


def test_queue_filters_search_oversight_and_privacy(submitted, setup):
    client, staff, _, _, documents = submitted
    assert client.get("/api/v1/documents/review-queue/").status_code == 403
    assert decide(staff, documents[0], "VERIFIED").status_code == 200
    assert staff.get("/api/v1/documents/review-queue/").data["count"] == 3
    assert staff.get("/api/v1/documents/review-queue/?status=VERIFIED").data["count"] == 1
    assert staff.get("/api/v1/documents/review-queue/?search=nonexistent").data["count"] == 0
    assert staff.get("/api/v1/documents/review-queue/?search=Ana").data["count"] == 3
    assert staff.get("/api/v1/documents/review-queue/?status=INVALID").status_code == 400
    admin = User.objects.create_superuser(email="oversight@example.test", password="test-password")
    staff.force_authenticate(admin)
    response = staff.get("/api/v1/documents/review-queue/?status=ALL")
    assert response.status_code == 200 and response.data["count"] == 4
    for row in response.data["results"]:
        assert "religion" not in row and "ip_membership" not in row and "file" not in row
    client.force_authenticate(setup[2])
    assert client.get(f"/api/v1/documents/{documents[0]['id']}/").status_code == 404


def test_review_failure_rolls_back_decision(submitted):
    from unittest.mock import patch

    _, staff, _, _, documents = submitted
    with patch("apps.admissions.services.audit", side_effect=RuntimeError("audit failed")):
        with pytest.raises(RuntimeError):
            decide(staff, documents[0])
    assert not DocumentReview.objects.exists()
