# ruff: noqa: F811
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Notification
from apps.admissions.management.commands.send_requirement_reminders import send_reminders
from apps.admissions.models import Application
from apps.audit.models import AuditEvent
from apps.blockchain_records.models import BlockchainTransaction
from tests.test_admissions import create_application, setup, upload  # noqa: F401
from tests.test_early_enrollment import school  # noqa: F401

pytestmark = pytest.mark.django_db


def test_qr_contains_only_authorized_link_and_preserves_document_access(school):
    client, _, other, _, _ = school[0]
    app = create_application(school[0])
    req = client.get(f"/api/v1/applications/{app['id']}/requirements/").data[0]
    doc = upload(client, app["id"], req["id"]).data
    url = f"/api/v1/documents/{doc['id']}/verification-qr/?origin=https://testserver"
    # Inspect the actual value passed to the QR encoder, not the SVG's drawing geometry.
    from reportlab.graphics.barcode.qr import QrCodeWidget

    with patch("reportlab.graphics.barcode.qr.QrCodeWidget", wraps=QrCodeWidget) as encoder:
        response = client.get(url)
    assert response.status_code == 200
    assert response["Content-Type"] == "image/svg+xml"
    assert b"<svg" in response.content and "no-store" in response["Cache-Control"]
    assert encoder.call_args.args == (f"https://testserver/verify-documents/{doc['id']}",)
    assert client.get(url.replace("https://testserver", "https://evil.example")).status_code == 400
    assert AuditEvent.objects.filter(action="GENERATE_DOCUMENT_QR").count() == 1
    client.force_authenticate(other)
    assert client.get(url).status_code == 404
    assert APIClient().get(url).status_code == 401
    guidance = school[1]["GUIDANCE_OFFICER"][1]
    assert guidance.get(url).status_code == 403
    assert school[1]["REGISTRAR"][1].get(url).status_code == 200


def test_reminders_target_actionable_requirements_only_and_survive_notice_deletion(school):
    client, owner, _, _, _ = school[0]
    app = create_application(school[0])
    assert client.post(f"/api/v1/applications/{app['id']}/submit/").status_code == 200
    assert send_reminders() == 0  # Give the learner at least 24 hours.
    Application.objects.filter(pk=app["id"]).update(submitted_at=timezone.now() - timedelta(days=2))
    assert send_reminders() == 1
    notice = Notification.objects.get(recipient=owner, title="Upload Missing Requirements")
    notice.delete()
    assert send_reminders() == 0
    assert AuditEvent.objects.filter(action="REQUIREMENTS_REMINDER_SENT").count() == 1
    Application.objects.filter(pk=app["id"]).update(
        last_requirements_reminder_at=timezone.now() - timedelta(days=2)
    )
    docs = [
        upload(client, app["id"], entry["id"]).data
        for entry in client.get(f"/api/v1/applications/{app['id']}/requirements/").data
    ]
    assert send_reminders() == 0  # All documents await the Registrar; no learner action.
    reg = school[1]["REGISTRAR"][1]
    assert (
        reg.post(
            f"/api/v1/documents/{docs[0]['id']}/review/",
            {"decision": "RESUBMISSION_REQUESTED", "remarks": "Upload a readable PDF."},
            format="json",
        ).status_code
        == 200
    )
    assert send_reminders() == 1
    assert Notification.objects.filter(
        recipient=owner, title="Document Corrections Needed"
    ).exists()


def test_no_reminders_for_closed_period_or_inactive_account(school):
    client, owner, _, _, period = school[0]
    app = create_application(school[0])
    client.post(f"/api/v1/applications/{app['id']}/submit/")
    Application.objects.filter(pk=app["id"]).update(submitted_at=timezone.now() - timedelta(days=2))
    period.is_active = False
    period.save()
    assert send_reminders() == 0
    period.is_active = True
    period.save()
    owner.is_active = False
    owner.save()
    assert send_reminders() == 0


def test_transaction_report_filters_exports_and_permission_boundaries(school):
    app = create_application(school[0])
    school[0][0].post(f"/api/v1/applications/{app['id']}/submit/")
    proof = BlockchainTransaction.objects.create(
        operation_key=f"PRE_ENROLLMENT_CONFIRMED:{app['id']}",
        record_type="PRE_ENROLLMENT_CONFIRMED",
        opaque_reference="a" * 64,
        record_hash="b" * 64,
        status="CONFIRMED",
        transaction_hash="0x" + "c" * 64,
        chain_id=31337,
        block_number=5,
    )
    url = "/api/v1/enrollment-reports/?report=blockchain-transactions"
    reg = school[1]["REGISTRAR"][1]
    result = reg.get(url)
    assert result.status_code == 200 and result.data["count"] == 1
    assert result.data["rows"][0]["Transaction"] == proof.transaction_hash
    assert reg.get(url + "&grade_level=12").data["count"] == 0
    assert reg.get(url + "&ordering=-Status").status_code == 200
    assert reg.get(url + "&ordering=secret").status_code == 400
    for fmt, mime in [("csv", "text/csv"), ("pdf", "application/pdf")]:
        export = reg.get(url + f"&export={fmt}")
        assert export.status_code == 200 and mime in export["Content-Type"]
        assert "no-store" in export["Cache-Control"]
    assert school[0][0].get(url).status_code == 403
    assert school[1]["CLASS_ADVISER"][1].get(url).status_code == 403
    assert APIClient().get(url).status_code == 401
