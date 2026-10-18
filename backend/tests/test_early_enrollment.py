"""Client workflow acceptance tests; concurrency also runs against PostgreSQL."""
# ruff: noqa: F811

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.admissions.enrollment_services import assign_section
from apps.admissions.models import (
    Application,
    DocumentSubmission,
    EnrollmentEvent,
    GuidanceInterview,
    Learner,
    Program,
    Section,
    SectionAssignment,
)
from apps.blockchain_records.models import BlockchainTransaction
from apps.blockchain_records.services import verify_integrity
from tests.test_admissions import create_application, pdf, setup, upload  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def school(setup):
    client, owner, _, learner, period = setup
    call_command("setup_admissions_roles")
    learner.previous_school = "Synthetic previous school"
    learner.last_grade_completed = 10
    learner.school_year_completed = "2025-2026"
    learner.save()
    staff = {}
    for role in ["REGISTRAR", "ADMINISTRATOR", "GUIDANCE_OFFICER", "CLASS_ADVISER"]:
        user = User.objects.create_user(email=f"{role.lower()}@workflow.test", role=role)
        user.groups.add(Group.objects.get(name=role))
        api = APIClient()
        api.force_authenticate(user)
        staff[role] = (user, api)
    return setup, staff


def transition(client, app, action, **extra):
    return client.post(
        f"/api/v1/enrollments/{app['id']}/transition/", {"action": action, **extra}, format="json"
    )


def qualified(school, classification="RETURNING"):
    setup, staff = school
    app = create_application(setup, classification=classification)
    assert setup[0].post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    guidance = staff["GUIDANCE_OFFICER"][1]
    registrar = staff["REGISTRAR"][1]
    assert (
        transition(guidance, app, "interview", remarks="Private interview notes").status_code == 200
    )
    if classification == "NEW":
        entries = setup[0].get(f"/api/v1/applications/{app['id']}/requirements/").data
        for entry in entries:
            doc = upload(setup[0], app["id"], entry["id"]).data
            assert (
                registrar.post(
                    f"/api/v1/documents/{doc['id']}/review/",
                    {"decision": "VERIFIED"},
                    format="json",
                ).status_code
                == 200
            )
    response = transition(registrar, app, "qualify")
    assert response.status_code == 200, response.data
    return response.data


def section_for(school, app, **extra):
    return Section.objects.create(
        code="A",
        name="Synthetic section A",
        school_year=school[0][4].school_year,
        track_id=app["track"],
        program_id=app["program"],
        grade_level=11,
        capacity=40,
        **extra,
    )


def test_verified_requirements_and_guidance_gate(school):
    setup, staff = school
    app = create_application(setup)
    assert setup[0].post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    registrar = staff["REGISTRAR"][1]
    assert transition(registrar, app, "qualify").status_code == 400
    assert transition(registrar, app, "interview").status_code == 403
    assert transition(staff["GUIDANCE_OFFICER"][1], app, "interview").status_code == 200
    assert transition(registrar, app, "qualify").status_code == 400
    assert transition(staff["ADMINISTRATOR"][1], app, "qualify").status_code == 403
    assert transition(setup[0], app, "pre_enroll").status_code == 403


def test_full_workflow_manual_lis_only(school):
    app = qualified(school, "NEW")
    section = section_for(school, app, adviser=school[1]["CLASS_ADVISER"][0])
    reg = school[1]["REGISTRAR"][1]
    assert transition(reg, app, "lis_confirm", remarks="Invented shortcut").status_code == 400
    response = transition(reg, app, "pre_enroll")
    assert response.status_code == 200, response.data
    assert response.data["enrollment_status"] == "SECTION_ASSIGNED"
    assert response.data["section_assignment"]["section"] == section.pk
    assert response.data["officially_enrolled_at"] is None
    assert transition(reg, app, "lis_confirm", remarks="Skipped submission").status_code == 400
    assert transition(reg, app, "lis_prepare").status_code == 200
    assert transition(reg, app, "lis_submit").status_code == 200
    assert transition(reg, app, "lis_confirm").status_code == 400
    confirmed = transition(
        reg,
        app,
        "lis_confirm",
        reference="TEST-LIS-1",
        remarks="Confirmed against school LIS record.",
    )
    assert confirmed.status_code == 200, confirmed.data
    assert confirmed.data["enrollment_status"] == "OFFICIALLY_ENROLLED"
    assert confirmed.data["lis_record"]["status"] == "LIS_CONFIRMED"
    assert confirmed.data["officially_enrolled_at"]
    assert transition(reg, app, "remove_section", remarks="Cannot remove").status_code == 400
    assert BlockchainTransaction.objects.filter(record_type="DOCUMENT_VERIFIED").count() == 4
    assert BlockchainTransaction.objects.filter(record_type="REGISTRATION_RECORDED").count() == 1
    assert "Private interview notes" not in str(
        school[0][0].get(f"/api/v1/enrollments/{app['id']}/").data
    )
    adviser = school[1]["CLASS_ADVISER"][1]
    assert len(adviser.get(f"/api/v1/sections/{section.pk}/roster/").data) == 1
    assert adviser.get("/api/v1/documents/").status_code == 403


def fill_section(section, period, count, registrar):
    for i in range(count):
        learner = Learner.objects.create(
            first_name=f"Synthetic {i}",
            last_name="Capacity",
            birthdate="2008-01-01",
            sex="Female",
            address="Test",
            contact_number="000",
            previous_school="Test",
            last_grade_completed=10,
            school_year_completed="2025-2026",
        )
        app = Application.objects.create(
            learner=learner,
            admission_period=period,
            grade_level=11,
            track=section.track_id,
            program=section.program,
            classification="RETURNING",
            source="ONLINE",
            created_by=registrar,
            status="SUBMITTED",
            submitted_at=timezone.now(),
            enrollment_status="SECTION_ASSIGNED",
        )
        SectionAssignment.objects.create(
            application=app,
            learner=learner,
            school_year=period.school_year,
            section=section,
            assigned_by=registrar,
        )


@pytest.mark.parametrize(
    "track,capacity,occupied",
    [
        ("ACADEMIC", 40, 39),
        ("ACADEMIC", 40, 40),
        ("TECHNICAL_PROFESSIONAL", 25, 24),
        ("TECHNICAL_PROFESSIONAL", 25, 25),
    ],
)
def test_track_capacity_limits(school, track, capacity, occupied):
    app = qualified(school)
    program = Program.objects.create(name="Synthetic capacity program", track=track)
    Application.objects.filter(pk=app["id"]).update(track=track, program=program)
    app.update(track=track, program=program.pk)
    section = section_for(school, app)
    section.capacity = capacity
    section.save()
    fill_section(section, school[0][4], occupied, school[1]["REGISTRAR"][0])
    response = transition(school[1]["REGISTRAR"][1], app, "pre_enroll")
    assert response.status_code == 200, response.data
    assert section.assignments.count() == min(capacity, occupied + 1)
    if occupied == capacity:
        assert response.data["enrollment_status"] == "PRE_ENROLLED"
        assert response.data["section_assignment"] is None
        assert EnrollmentEvent.objects.filter(
            application_id=app["id"], action="NO_AVAILABLE_SECTION"
        ).exists()
    else:
        assert response.data["enrollment_status"] == "SECTION_ASSIGNED"


def test_matching_deterministic_transfer_and_uniqueness(school):
    app = qualified(school)
    first = section_for(school, app)
    second = Section.objects.create(
        code="B",
        name="B",
        school_year=first.school_year,
        track=first.track,
        program=first.program,
        grade_level=11,
        capacity=40,
    )
    wrong = Section.objects.create(
        code="0",
        name="Wrong grade",
        school_year=first.school_year,
        track=first.track,
        program=first.program,
        grade_level=12,
        capacity=40,
    )
    reg = school[1]["REGISTRAR"][1]
    response = transition(reg, app, "pre_enroll")
    assert response.data["section_assignment"]["section"] == first.pk
    assert transition(reg, app, "auto_assign").status_code == 200
    assert SectionAssignment.objects.filter(application_id=app["id"]).count() == 1
    assert (
        transition(reg, app, "assign", section=wrong.pk, remarks="Wrong grade").status_code == 400
    )
    assert transition(reg, app, "assign", section=second.pk).status_code == 400
    assert (
        transition(reg, app, "assign", section=second.pk, remarks="Balance roster").status_code
        == 200
    )
    log = EnrollmentEvent.objects.get(application_id=app["id"], action="SECTION_TRANSFERRED")
    assert log.metadata == {"old_section": first.pk, "new_section": second.pk}
    assert transition(reg, app, "remove_section", remarks="Learner request").status_code == 200
    assert not SectionAssignment.objects.filter(application_id=app["id"]).exists()
    assert transition(reg, app, "lis_prepare").status_code == 400


def test_integrity_duplicate_flags_and_tamper(school):
    setup, _ = school
    app = create_application(setup)
    requirements = setup[0].get(f"/api/v1/applications/{app['id']}/requirements/").data
    original = upload(setup[0], app["id"], requirements[0]["id"]).data
    duplicate = upload(setup[0], app["id"], requirements[1]["id"]).data
    assert "DUPLICATE_CONTENT" in duplicate["validation_flags"]
    document = DocumentSubmission.objects.get(pk=original["id"])
    assert verify_integrity(document)["status"] == "UNCHANGED"
    with document.file.open("rb") as file:
        altered = file.read() + b"\n% altered bytes"
    result = verify_integrity(document, pdf(altered))
    assert result["status"] == "INTEGRITY_VERIFICATION_FAILED"
    assert result["source"] == "DATABASE_UPLOAD_HASH"


def test_reports_privacy_exports_and_roles(school):
    app = qualified(school)
    reg = school[1]["REGISTRAR"][1]
    assert transition(reg, app, "pre_enroll").status_code == 200
    from apps.admissions.reports import REPORTS, csv_cell

    assert csv_cell("=HYPERLINK(test)").startswith("'")
    for report in REPORTS:
        response = reg.get(f"/api/v1/enrollment-reports/?report={report}")
        assert response.status_code == 200, response.data
        assert "Private religion" not in str(response.data)
    assert reg.get("/api/v1/enrollment-reports/?export=pdf").content.startswith(b"%PDF")
    assert reg.get("/api/v1/enrollment-reports/?export=csv")["Cache-Control"] == "private, no-store"
    assert school[0][0].get("/api/v1/enrollment-reports/").status_code == 403
    assert school[1]["CLASS_ADVISER"][1].get("/api/v1/enrollment-reports/").status_code == 403


@pytest.mark.django_db(transaction=True)
def test_concurrent_assignments_never_exceed_capacity(school):
    if connection.vendor != "postgresql":
        pytest.skip("Requires PostgreSQL row locks; run the documented concurrency command.")
    app = qualified(school)
    first = section_for(school, app)
    registrar = school[1]["REGISTRAR"][0]
    fill_section(first, school[0][4], 39, registrar)
    original = Application.objects.get(pk=app["id"])
    original.enrollment_status = "PRE_ENROLLED"
    original.save()
    learner = Learner.objects.create(
        first_name="Concurrent",
        last_name="Learner",
        birthdate="2008-01-01",
        sex="Male",
        address="Test",
        contact_number="000",
        previous_school="Test",
        last_grade_completed=10,
        school_year_completed="2025-2026",
    )
    other = Application.objects.create(
        learner=learner,
        admission_period=original.admission_period,
        grade_level=11,
        track=original.track,
        program=original.program,
        classification="RETURNING",
        source="ONLINE",
        created_by=registrar,
        status="SUBMITTED",
        submitted_at=timezone.now(),
        enrollment_status="PRE_ENROLLED",
    )
    GuidanceInterview.objects.create(application=other, officer=school[1]["GUIDANCE_OFFICER"][0])
    barrier = Barrier(2)

    def assign(pk):
        close_old_connections()
        try:
            user = User.objects.get(pk=registrar.pk)
            request = SimpleNamespace(user=user, META={})
            candidate = Application.objects.get(pk=pk)
            barrier.wait(timeout=10)
            result = assign_section(candidate, request, automatic=True)
            return result is not None
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(assign, [original.pk, other.pk]))
    assert sorted(results) == [False, True]
    assert first.assignments.count() == 40


def test_track_defaults_and_authorized_capacity_override(school):
    admin = school[1]["ADMINISTRATOR"][1]
    reg = school[1]["REGISTRAR"][1]
    response = admin.post(
        "/api/v1/tracks/",
        {
            "code": "CUSTOM_TECH",
            "name": "Synthetic configurable track",
            "category": "TECHPRO",
            "active": True,
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["default_section_capacity"] == 25
    url = "/api/v1/tracks/CUSTOM_TECH/"
    assert admin.patch(url, {"default_section_capacity": 30}, format="json").status_code == 400
    assert (
        admin.patch(
            url, {"default_section_capacity": 30, "reason": "Approved test capacity"}, format="json"
        ).status_code
        == 200
    )
    assert (
        reg.patch(
            url, {"default_section_capacity": 35, "reason": "Unauthorized"}, format="json"
        ).status_code
        == 403
    )
    app = qualified(school)
    section = section_for(school, app)
    transition(reg, app, "pre_enroll")
    assert (
        admin.patch(
            f"/api/v1/sections/{section.pk}/", {"capacity": 0, "reason": "Invalid"}, format="json"
        ).status_code
        == 400
    )


def test_assignment_rejects_other_track_and_program_and_selects_lowest_count(school):
    app = qualified(school)
    first = section_for(school, app)
    second = Section.objects.create(
        code="B",
        name="Second",
        school_year=first.school_year,
        track=first.track,
        program=first.program,
        grade_level=11,
        capacity=40,
    )
    other_program = Program.objects.create(name="Different synthetic program", track=app["track"])
    wrong_program = Section.objects.create(
        code="C",
        name="Wrong program",
        school_year=first.school_year,
        track=first.track,
        program=other_program,
        grade_level=11,
        capacity=40,
    )
    tech_program = Program.objects.create(
        name="Synthetic technical program", track="TECHNICAL_PROFESSIONAL"
    )
    wrong_track = Section.objects.create(
        code="D",
        name="Wrong track",
        school_year=first.school_year,
        track_id="TECHNICAL_PROFESSIONAL",
        program=tech_program,
        grade_level=11,
        capacity=25,
    )
    reg_user, reg = school[1]["REGISTRAR"]
    fill_section(first, school[0][4], 1, reg_user)
    response = transition(reg, app, "pre_enroll")
    assert response.data["section_assignment"]["section"] == second.pk
    for target in [wrong_program, wrong_track]:
        assert (
            transition(reg, app, "assign", section=target.pk, remarks="Wrong match").status_code
            == 400
        )


def test_single_profile_and_legacy_program_completion(school):
    setup, staff = school
    client, _, _, learner, _ = setup
    from tests.test_admissions import learner_data

    payload = learner_data() | {"lrn": "987654321012"}
    assert client.post("/api/v1/learners/", payload, format="json").status_code == 400
    app = create_application(setup, classification="RETURNING")
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    old_program = app["program"]
    Application.objects.filter(pk=app["id"]).update(program=None)
    assert (
        transition(
            client, app, "complete_program", program=old_program, remarks="No authority"
        ).status_code
        == 403
    )
    result = transition(
        staff["REGISTRAR"][1],
        app,
        "complete_program",
        program=old_program,
        remarks="Learner confirmed previously missing selection.",
    )
    assert result.status_code == 200, result.data
    assert result.data["program"] == old_program
    assert (
        transition(
            staff["REGISTRAR"][1],
            app,
            "complete_program",
            program=old_program,
            remarks="Already set",
        ).status_code
        == 400
    )


def test_additional_permissions_are_superadministrator_only_and_audited(school):
    _, staff = school
    administrator, client = staff["ADMINISTRATOR"]
    assert client.get("/api/v1/accounts/access-policy/").status_code == 403
    administrator.is_superuser = True
    administrator.set_password("Test-Access-Cedar-4809!")
    administrator.save()
    data = client.get("/api/v1/accounts/access-policy/")
    assert data.status_code == 200
    target = staff["CLASS_ADVISER"][0]
    response = client.post(
        "/api/v1/accounts/access-policy/",
        {
            "user": str(target.pk),
            "permissions": [],
            "current_password": "Test-Access-Cedar-4809!",
            "reason": "Restore role defaults",
        },
        format="json",
    )
    assert response.status_code == 204, response.data
    target.refresh_from_db()
    assert target.security_version == 1
    from apps.audit.models import AuditEvent

    assert AuditEvent.objects.filter(action="UPDATE_ACCESS_POLICY", entity_id=target.pk).exists()


def test_paged_learner_directory_search_and_ownership(school):
    from tests.test_admissions import learner_data

    registrar = school[1]["REGISTRAR"][1]
    for index in range(25):
        data = learner_data()
        data.update(lrn=f"555{index:09d}", first_name=f"Directory{index:02d}", last_name="Test")
        Learner.objects.create(**data)
    first = registrar.get("/api/v1/learners/?page=1&search=Directory")
    second = registrar.get("/api/v1/learners/?page=2&search=Directory")
    assert first.status_code == second.status_code == 200
    assert first.data["count"] == 25
    assert len(first.data["results"]) == 20
    assert len(second.data["results"]) == 5
    assert not (
        {r["id"] for r in first.data["results"]} & {r["id"] for r in second.data["results"]}
    )
    own = school[0][0].get("/api/v1/learners/?page=1&search=Directory")
    assert own.data["count"] == 0
    assert registrar.get("/api/v1/learners/?page=0").status_code == 404


def test_report_database_pagination_preserves_full_export(school):
    from tests.test_admissions import learner_data

    base = create_application(school[0])
    for index in range(25):
        data = learner_data()
        data.update(lrn=f"777{index:09d}", first_name=f"Report{index:02d}")
        learner = Learner.objects.create(**data)
        Application.objects.create(
            learner=learner,
            admission_period=school[0][4],
            grade_level=11,
            track=base["track"],
            program_id=base["program"],
            classification="RETURNING",
            source="ONLINE",
            submitted_at=timezone.now(),
            status="SUBMITTED",
            enrollment_status="FOR_DOCUMENT_VERIFICATION",
            created_by=school[1]["REGISTRAR"][0],
        )
    registrar = school[1]["REGISTRAR"][1]
    first = registrar.get("/api/v1/enrollment-reports/?page=1")
    second = registrar.get("/api/v1/enrollment-reports/?page=2")
    assert first.status_code == second.status_code == 200
    assert first.data["count"] == 25
    assert len(first.data["rows"]) == 20
    assert len(second.data["rows"]) == 5
    export = registrar.get("/api/v1/enrollment-reports/?page=2&export=csv")
    assert export.status_code == 200
    assert export.content.count(b"Report") == 25
    summary = registrar.get("/api/v1/enrollment-reports/?report=by-track")
    assert summary.data["rows"][0]["Learners"] == 25
    metrics = registrar.get("/api/v1/enrollment-metrics/")
    assert metrics.data["tracks"][base["track"]] == 25
    assert metrics.data["statuses"]["FOR_DOCUMENT_VERIFICATION"] == 25


def test_pending_application_query_excludes_finished_records(school):
    app = create_application(school[0])
    client = school[0][0]
    assert client.get("/api/v1/enrollments/?pending=true").data["count"] == 1
    Application.objects.filter(pk=app["id"]).update(enrollment_status="OFFICIALLY_ENROLLED")
    assert client.get("/api/v1/enrollments/?pending=true").data["count"] == 0
