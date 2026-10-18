"""Seed ONLY an isolated Playwright database; never the user's development database."""

import json
import os
from datetime import timedelta
from io import BytesIO
from pathlib import Path


def main():
    root = Path(os.environ["ENROLLCHAIN_E2E_ROOT"]).resolve()
    if not root.name.startswith("enrollchain-live-"):
        raise RuntimeError("An isolated enrollchain-live-* directory is required")
    os.environ["DATABASE_URL"] = "sqlite:///" + str(root / "test.sqlite3")
    os.environ["PRIVATE_MEDIA_ROOT"] = str(root / "private-media")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    os.environ["BLOCKCHAIN_LOCAL_CONFIG"] = "false"
    import django

    django.setup()
    from django.contrib.auth.models import Group
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.core.management import call_command
    from django.utils import timezone
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    from rest_framework.test import APIClient

    from apps.accounts.models import User
    from apps.admissions.models import (
        AdmissionPeriod,
        Learner,
        Program,
        Requirement,
        SchoolYear,
        Section,
    )
    from apps.admissions.services import seed_period_requirements

    call_command("migrate", verbosity=0)
    call_command("setup_admissions_roles", verbosity=0)
    password = "Live-test-password-Cedar-4709!"
    users = {}
    for name, role in [
        ("applicant", "LEARNER"),
        ("other", "LEARNER"),
        ("registrar", "REGISTRAR"),
        ("administrator", "ADMINISTRATOR"),
        ("technical", "ADMINISTRATOR"),
        ("guidance", "GUIDANCE_OFFICER"),
        ("adviser", "CLASS_ADVISER"),
    ]:
        user = User.objects.create_user(
            email=f"{name}@live.example.test",
            password=password,
            role=role,
            is_superuser=name == "technical",
            is_staff=name == "technical",
        )
        user.groups.add(Group.objects.get(name=role))
        users[name] = user
    today = timezone.localdate()
    year = SchoolYear.objects.create(
        name="Live test school year",
        starts_on=today - timedelta(days=10),
        ends_on=today + timedelta(days=365),
    )
    period = AdmissionPeriod.objects.create(
        name="Live test admission",
        school_year=year,
        opens_on=today - timedelta(days=1),
        closes_on=today + timedelta(days=30),
    )
    seed_period_requirements(period)
    learner = Learner.objects.create(
        owner=users["applicant"],
        lrn="999000000001",
        first_name="Ana",
        last_name="Cruz",
        birthdate="2008-01-01",
        sex="Female",
        address="Synthetic test address",
        contact_number="09000000000",
        previous_school="Test school",
        last_grade_completed=10,
        school_year_completed="2025-2026",
    )
    program = Program.objects.create(name="Synthetic live program", code="TEST", track="ACADEMIC")
    Section.objects.create(
        code="TEST-A",
        name="Synthetic live section",
        school_year=year,
        track_id="ACADEMIC",
        program=program,
        grade_level=11,
        capacity=40,
        adviser=users["adviser"],
    )
    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    for number in [1, 2]:
        page = writer.add_blank_page(width=595, height=842)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
        )
        content = DecodedStreamObject()
        content.set_data(
            f"BT /F1 18 Tf 40 760 Td (Synthetic review document - page {number}) Tj ET".encode()
        )
        page[NameObject("/Contents")] = writer._add_object(content)
    output = BytesIO()
    writer.write(output)
    (root / "replacement.pdf").write_bytes(output.getvalue())
    client = APIClient()
    client.force_authenticate(users["applicant"])
    response = client.post(
        "/api/v1/applications/",
        {
            "learner": str(learner.pk),
            "admission_period": period.pk,
            "grade_level": 11,
            "track": "ACADEMIC",
            "program": program.pk,
            "classification": "NEW",
            "source": "ONLINE",
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    app = response.data
    docs = []
    for requirement in Requirement.objects.all():
        response = client.post(
            "/api/v1/documents/",
            {
                "application": app["id"],
                "requirement": requirement.pk,
                "file": SimpleUploadedFile(
                    "synthetic-record.pdf", output.getvalue(), content_type="application/pdf"
                ),
            },
            format="multipart",
        )
        assert response.status_code == 201, response.data
        docs.append(response.data["id"])
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    print(
        json.dumps({"application": app["id"], "reference": app["reference"], "document": docs[0]})
    )


if __name__ == "__main__":
    main()
