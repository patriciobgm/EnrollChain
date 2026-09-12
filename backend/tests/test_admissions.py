import hashlib
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.utils import timezone
from pypdf import PdfWriter
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.admissions.models import (
    AdmissionPeriod,
    Application,
    DocumentSubmission,
    Learner,
    Program,
    Requirement,
    RequirementRule,
    SchoolYear,
)
from apps.admissions.services import MAX_PDF_SIZE, seed_period_requirements, validate_pdf
from apps.audit.models import AuditEvent
from apps.common.storage import PrivateMediaStorage

pytestmark = pytest.mark.django_db


def pdf_bytes():
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.write(buffer)
    return buffer.getvalue()


def pdf(content=None, name="record.pdf", mime="application/pdf"):
    return SimpleUploadedFile(
        name, content if content is not None else pdf_bytes(), content_type=mime
    )


@pytest.fixture
def setup(settings, tmp_path):
    settings.PRIVATE_MEDIA_ROOT = tmp_path
    # Model storage is created on import; isolate actual bytes for every test.
    storage = DocumentSubmission._meta.get_field("file").storage
    with patch.object(storage, "_location", tmp_path):
        storage.__dict__.pop("location", None)
        storage.__dict__.pop("base_location", None)
        user = User.objects.create_user(email="applicant@example.com", password="test-password")
        other = User.objects.create_user(email="other@example.com", password="test-password")
        today = timezone.localdate()
        year = SchoolYear.objects.create(
            name="Test year",
            starts_on=today - timedelta(days=10),
            ends_on=today + timedelta(days=100),
        )
        period = AdmissionPeriod.objects.create(
            school_year=year,
            name="Admission",
            opens_on=today - timedelta(days=1),
            closes_on=today + timedelta(days=10),
        )
        seed_period_requirements(period)
        learner = Learner.objects.create(owner=user, **learner_data())
        client = APIClient()
        client.force_authenticate(user)
        yield client, user, other, learner, period
        storage.__dict__.pop("location", None)
        storage.__dict__.pop("base_location", None)


def learner_data():
    return dict(
        lrn="123456789012",
        first_name="Ana",
        last_name="Cruz",
        birthdate="2008-01-05",
        sex="Female",
        address="Development address",
        contact_number="09123456789",
        religion="Private religion",
        ip_membership="Private community",
    )


def application_data(learner, period, **extra):
    return (
        dict(
            learner=str(learner.pk),
            admission_period=period.pk,
            grade_level=11,
            track="ACADEMIC",
            classification="NEW",
            source="ONLINE",
        )
        | extra
    )


def create_application(setup, **extra):
    client, _, _, learner, period = setup
    response = client.post("/api/v1/applications/", application_data(learner, period, **extra))
    assert response.status_code == 201, response.data
    return response.data


def grant(user, *codes):
    user.user_permissions.add(
        *Permission.objects.filter(content_type__app_label="admissions", codename__in=codes)
    )
    for attr in ["_perm_cache", "_user_perm_cache", "_group_perm_cache"]:
        user.__dict__.pop(attr, None)


def upload(client, application, requirement, file=None):
    return client.post(
        "/api/v1/documents/",
        {
            "application": str(application),
            "requirement": requirement,
            "file": file if file is not None else pdf(),
        },
        format="multipart",
    )


def test_profile_ownership_and_private_fields(setup):
    client, user, other, learner, _ = setup
    response = client.get("/api/v1/learners/")
    assert response.data[0]["age"] == learner_age()
    assert response.data[0]["religion"] == "Private religion"
    client.force_authenticate(other)
    assert client.get("/api/v1/learners/").data == []
    assert client.get(f"/api/v1/learners/{learner.pk}/").status_code == 404
    assert (
        client.patch(f"/api/v1/learners/{learner.pk}/", {"first_name": "Changed"}).status_code
        == 404
    )
    data = learner_data() | {"lrn": "123456789013", "owner": str(user.pk)}
    assert client.post("/api/v1/learners/", data).status_code == 400
    client.force_authenticate(None)
    assert client.get("/api/v1/learners/").status_code == 401


def learner_age():
    today = timezone.localdate()
    return today.year - 2008 - ((today.month, today.day) < (1, 5))


@pytest.mark.parametrize(
    "change",
    [
        {"lrn": "abc"},
        {"lrn": "１２３４５６７８９０１２"},
        {"birthdate": "2999-01-01"},
        {"first_name": ""},
    ],
)
def test_profile_validation(setup, change):
    client = setup[0]
    assert (
        client.post(
            "/api/v1/learners/", learner_data() | {"lrn": "123456789014"} | change
        ).status_code
        == 400
    )


def test_profile_unique_lrn_and_age_not_stored(setup):
    client = setup[0]
    assert client.post("/api/v1/learners/", learner_data()).status_code == 400
    assert "age" not in [field.name for field in Learner._meta.fields]


def test_application_unique_and_audited(setup):
    client, user, _, learner, period = setup
    app = create_application(setup)
    assert app["reference"].startswith("APP-")
    assert app["status"] == "DRAFT" and app["submitted_at"] is None
    assert app["applicant"] == str(user.pk)
    assert (
        client.post("/api/v1/applications/", application_data(learner, period)).status_code == 400
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        Application.objects.create(
            learner=learner,
            admission_period=period,
            grade_level=11,
            track="ACADEMIC",
            classification="NEW",
            created_by=user,
        )
    assert AuditEvent.objects.filter(action="CREATE_APPLICATION", entity_id=app["id"]).count() == 1
    event = AuditEvent.objects.get(action="CREATE_APPLICATION")
    assert event.metadata == {}  # No religion, community membership, or other profile data.


@pytest.mark.parametrize(
    "change",
    [
        {"grade_level": 10},
        {"grade_level": 13},
        {"track": "STEM"},
        {"classification": "UNKNOWN"},
        {"source": "WALK_IN"},
        {"source": "LATE"},
    ],
)
def test_application_choices(setup, change):
    client, _, _, learner, period = setup
    assert (
        client.post(
            "/api/v1/applications/", application_data(learner, period, **change)
        ).status_code
        == 400
    )


def test_program_track_and_active_validation(setup):
    client, _, _, learner, period = setup
    program = Program.objects.create(name="Client configurable", track="TECHNICAL_PROFESSIONAL")
    data = application_data(learner, period, program=program.pk)
    assert client.post("/api/v1/applications/", data).status_code == 400
    program.track = "ACADEMIC"
    program.is_active = False
    program.save()
    assert client.post("/api/v1/applications/", data).status_code == 400
    program.is_active = True
    program.save()
    assert client.post("/api/v1/applications/", data).status_code == 201


def test_cannot_apply_for_other_learner(setup):
    client, _, other, learner, period = setup
    client.force_authenticate(other)
    assert (
        client.post("/api/v1/applications/", application_data(learner, period)).status_code == 400
    )


@pytest.mark.parametrize(
    "role", ["REGISTRAR", "ADMINISTRATOR", "GUIDANCE_OFFICER", "CLASS_ADVISER"]
)
def test_staff_require_explicit_permissions(setup, role):
    client, _, other, _, _ = setup
    other.role = role
    other.save()
    client.force_authenticate(other)
    assert client.get("/api/v1/learners/").status_code == 403
    assert client.get("/api/v1/applications/").status_code == 403
    assert client.get("/api/v1/documents/").status_code == 403
    grant(other, "view_learner")
    assert client.get("/api/v1/learners/").status_code == 200


def test_registrar_walk_in_without_applicant_account(setup):
    client, _, registrar, _, period = setup
    registrar.role = "REGISTRAR"
    registrar.save()
    grant(registrar, "add_learner", "view_learner", "add_application")
    client.force_authenticate(registrar)
    profile = client.post("/api/v1/learners/", learner_data() | {"lrn": "123456789015"})
    assert profile.status_code == 201
    learner = Learner.objects.get(pk=profile.data["id"])
    assert learner.owner is None
    app = client.post("/api/v1/applications/", application_data(learner, period, source="WALK_IN"))
    assert app.status_code == 201
    assert app.data["applicant"] is None


def test_defaults_configurable_scoping_and_returning(setup):
    client, _, _, _, period = setup
    app = create_application(setup)
    assert len(client.get(f"/api/v1/applications/{app['id']}/requirements/").data) == 4
    application = Application.objects.get(pk=app["id"])
    application.classification = "RETURNING"
    application.save()
    assert client.get(f"/api/v1/applications/{app['id']}/requirements/").data == []
    req = Requirement.objects.create(name="Configured special requirement")
    program = Program.objects.create(name="Custom program", track="ACADEMIC")
    rule = RequirementRule.objects.create(
        requirement=req,
        admission_period=period,
        classification="RETURNING",
        grade_level=12,
        track="ACADEMIC",
        program=program,
    )
    url = f"/api/v1/applications/{app['id']}/requirements/"
    assert client.get(url).data == []
    application.grade_level = 12
    application.program = program
    application.save()
    assert client.get(url).data[0]["name"] == req.name
    rule.track = "TECHNICAL_PROFESSIONAL"
    rule.save()
    assert client.get(url).data == []


def test_pdf_hash_metadata_history_and_download(setup):
    client, _, other, _, _ = setup
    app = create_application(setup)
    req = Requirement.objects.first()
    content = pdf_bytes()
    first = upload(client, app["id"], req.pk, pdf(content))
    assert first.status_code == 201, first.data
    assert first.data["sha256"] == hashlib.sha256(content).hexdigest()
    assert first.data["file_size"] == len(content)
    assert first.data["mime_type"] == "application/pdf"
    assert first.data["original_filename"] == "record.pdf"
    assert "file" not in first.data
    assert first.data["stored_filename"] != "record.pdf"
    second = upload(client, app["id"], req.pk)
    assert second.status_code == 201 and second.data["version"] == 2
    assert DocumentSubmission.objects.count() == 2
    assert AuditEvent.objects.filter(action="UPLOAD_DOCUMENT").count() == 2
    url = f"/api/v1/documents/{first.data['id']}/download/"
    response = client.get(url)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == content
    assert response["Cache-Control"] == "private, no-store"
    with pytest.raises(ValueError, match="no public URL"):
        PrivateMediaStorage().url(first.data["stored_filename"])
    client.force_authenticate(other)
    assert client.get(url).status_code == 404
    assert client.get("/api/v1/documents/").data == []
    assert upload(client, app["id"], req.pk).status_code == 400
    assert client.get(f"/api/v1/applications/{app['id']}/requirements/").status_code == 404
    client.force_authenticate(None)
    assert client.get(url).status_code == 401


@pytest.mark.parametrize(
    "content,name,mime",
    [
        (b"not PDF", "x.pdf", "application/pdf"),
        (b"%PDF-1.7\ninvalid\n%%EOF", "x.pdf", "application/pdf"),
        (None, "x.txt", "application/pdf"),
        (None, "x.pdf", "image/png"),
        (b"", "x.pdf", "application/pdf"),
    ],
)
def test_rejects_invalid_pdf(setup, content, name, mime):
    client = setup[0]
    app = create_application(setup)
    response = upload(client, app["id"], Requirement.objects.first().pk, pdf(content, name, mime))
    assert response.status_code == 400
    assert not DocumentSubmission.objects.exists()
    assert not AuditEvent.objects.filter(action="UPLOAD_DOCUMENT").exists()


def test_pdf_size_boundary():
    from rest_framework.exceptions import ValidationError

    content = pdf_bytes()
    # A PDF comment can pad an otherwise valid PDF without changing its content.
    padded = content + b"\n%" + b" " * (MAX_PDF_SIZE - len(content) - 2)
    assert validate_pdf(pdf(padded))[1] == MAX_PDF_SIZE
    with pytest.raises(ValidationError, match="30 MB"):
        validate_pdf(pdf(padded + b" "))


def test_encrypted_pdf_rejected(setup):
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.encrypt("secret")
    buffer = BytesIO()
    writer.write(buffer)
    app = create_application(setup)
    response = upload(setup[0], app["id"], Requirement.objects.first().pk, pdf(buffer.getvalue()))
    assert response.status_code == 400


def test_submit_requires_uploads_then_locks_application(setup):
    client, _, _, learner, _ = setup
    app = create_application(setup)
    url = f"/api/v1/applications/{app['id']}/"
    assert client.post(url + "submit/").status_code == 400
    for req in Requirement.objects.all():
        assert upload(client, app["id"], req.pk).status_code == 201
    assert client.patch(url, {"classification": "RETURNING"}).status_code == 400
    response = client.post(url + "submit/")
    assert response.status_code == 200, response.data
    assert response.data["status"] == "SUBMITTED" and response.data["submitted_at"]
    assert client.post(url + "submit/").status_code == 400
    assert client.patch(url, {"grade_level": 12}).status_code == 400
    assert (
        client.patch(f"/api/v1/learners/{learner.pk}/", {"first_name": "Changed"}).status_code
        == 400
    )
    assert upload(client, app["id"], Requirement.objects.first().pk).status_code == 400
    assert AuditEvent.objects.filter(action="SUBMIT_APPLICATION").count() == 1


def test_returning_can_submit_without_documents(setup):
    app = create_application(setup, classification="RETURNING")
    response = setup[0].post(f"/api/v1/applications/{app['id']}/submit/")
    assert response.status_code == 200


@pytest.mark.parametrize("period_change", ["future", "closed", "inactive"])
def test_submission_requires_open_active_period(setup, period_change):
    app = create_application(setup, classification="RETURNING")
    period = setup[4]
    today = timezone.localdate()
    if period_change == "future":
        period.opens_on = today + timedelta(days=1)
    elif period_change == "closed":
        period.closes_on = today - timedelta(days=1)
    else:
        period.is_active = False
    period.save()
    assert setup[0].post(f"/api/v1/applications/{app['id']}/submit/").status_code == 400


def test_upload_unassigned_requirement_and_append_only_api(setup):
    app = create_application(setup, classification="RETURNING")
    client = setup[0]
    assert upload(client, app["id"], Requirement.objects.first().pk).status_code == 400
    assert client.delete(f"/api/v1/applications/{app['id']}/").status_code == 405


def test_configuration_permissions_defaults_validation(setup):
    client, _, staff, _, period = setup
    data = {
        "name": "New period",
        "school_year": period.school_year_id,
        "opens_on": "2027-01-01",
        "closes_on": "2027-02-01",
    }
    assert client.post("/api/v1/admission-periods/", data).status_code == 403
    staff.role = "ADMINISTRATOR"
    staff.save()
    grant(staff, "add_admissionperiod", "change_admissionperiod")
    client.force_authenticate(staff)
    response = client.post("/api/v1/admission-periods/", data)
    assert response.status_code == 201, response.data
    assert RequirementRule.objects.filter(admission_period_id=response.data["id"]).count() == 8
    assert (
        client.patch(
            f"/api/v1/admission-periods/{response.data['id']}/", {"closes_on": "2026-01-01"}
        ).status_code
        == 400
    )


def test_failure_cleans_storage_and_rolls_back_metadata(setup):
    client = setup[0]
    app = create_application(setup)
    with patch("apps.admissions.services.audit", side_effect=RuntimeError("audit unavailable")):
        with pytest.raises(RuntimeError):
            upload(client, app["id"], Requirement.objects.first().pk)
    assert not DocumentSubmission.objects.exists()
    root = DocumentSubmission._meta.get_field("file").storage.location
    from pathlib import Path

    assert list(Path(root).rglob("*.pdf")) == []


def test_staff_document_download_requires_permission(setup):
    client, _, staff, _, _ = setup
    app = create_application(setup)
    document = upload(client, app["id"], Requirement.objects.first().pk).data
    staff.role = "REGISTRAR"
    staff.save()
    client.force_authenticate(staff)
    url = f"/api/v1/documents/{document['id']}/download/"
    assert client.get(url).status_code == 403
    grant(staff, "view_documentsubmission")
    response = client.get(url)
    assert response.status_code == 200
    response.close()
    assert client.patch(f"/api/v1/documents/{document['id']}/", {"version": 5}).status_code == 405
    grant(staff, "change_documentsubmission")
    assert client.patch(f"/api/v1/documents/{document['id']}/", {"version": 5}).status_code == 405


def test_staff_submission_requires_action_permission(setup):
    client, _, staff, _, _ = setup
    app = create_application(setup, classification="RETURNING")
    staff.role = "REGISTRAR"
    staff.save()
    grant(staff, "view_application", "change_application")
    client.force_authenticate(staff)
    url = f"/api/v1/applications/{app['id']}/submit/"
    assert client.post(url).status_code == 403
    grant(staff, "submit_application")
    assert client.post(url).status_code == 200


def test_document_api_rejects_oversize_and_invalid_filter(setup):
    client = setup[0]
    app = create_application(setup)
    oversized = pdf(b"%PDF-" + b" " * MAX_PDF_SIZE)
    assert upload(client, app["id"], Requirement.objects.first().pk, oversized).status_code == 400
    assert not DocumentSubmission.objects.exists()
    assert client.get("/api/v1/documents/?application=invalid").status_code == 400


def test_role_setup_is_additive_and_idempotent(setup):
    from django.contrib.auth.models import Group
    from django.core.management import call_command

    call_command("setup_admissions_roles")
    call_command("setup_admissions_roles")
    assert (
        Group.objects.get(name="REGISTRAR")
        .permissions.filter(codename="submit_application")
        .exists()
    )
    assert not Group.objects.get(name="GUIDANCE_OFFICER").permissions.exists()
    assert not Group.objects.get(name="CLASS_ADVISER").permissions.exists()


def test_workflow_admin_is_inspection_only(setup):
    from django.contrib.admin.sites import site
    from django.test import RequestFactory

    admin = User.objects.create_superuser(email="admin@example.com", password="test-password")
    request = RequestFactory().get("/admin/")
    request.user = admin
    for model in [Learner, Application, DocumentSubmission]:
        model_admin = site._registry[model]
        assert model_admin.has_view_permission(request)
        assert not model_admin.has_add_permission(request)
        assert not model_admin.has_change_permission(request)
        assert not model_admin.has_delete_permission(request)


def test_owner_can_edit_registrar_created_walk_in_draft(setup):
    client, _, staff, learner, period = setup
    app = Application.objects.create(
        learner=learner,
        admission_period=period,
        grade_level=11,
        track="ACADEMIC",
        classification="RETURNING",
        source="WALK_IN",
        created_by=staff,
    )
    response = client.patch(f"/api/v1/applications/{app.pk}/", {"grade_level": 12})
    assert response.status_code == 200
    assert response.data["source"] == "WALK_IN"


def test_openapi_documents_use_binary_upload_schema():
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(public=True)
    upload_schema = schema["components"]["schemas"]["DocumentUploadRequest"]
    assert upload_schema["properties"]["file"]["format"] == "binary"
    content = schema["paths"]["/api/v1/documents/"]["post"]["requestBody"]["content"]
    assert "multipart/form-data" in content
    assert "application/json" not in content
