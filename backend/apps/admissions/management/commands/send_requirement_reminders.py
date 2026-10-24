"""Private, idempotent reminders; no email or external message delivery."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Notification
from apps.admissions.models import Application
from apps.admissions.services import checklist
from apps.audit.services import record_audit_event


def send_reminders():
    now = timezone.now()
    cutoff = now - timedelta(hours=24)
    candidates = Application.objects.filter(
        status="SUBMITTED",
        submitted_at__lte=cutoff,
        enrollment_status__in=["SUBMITTED", "FOR_DOCUMENT_VERIFICATION", "FOR_RESUBMISSION"],
        learner__owner__is_active=True,
        admission_period__is_active=True,
        admission_period__opens_on__lte=timezone.localdate(),
        admission_period__closes_on__gte=timezone.localdate(),
    ).filter(
        Q(last_requirements_reminder_at__isnull=True) | Q(last_requirements_reminder_at__lte=cutoff)
    )
    sent = 0
    for pk in candidates.values_list("pk", flat=True).iterator():
        with transaction.atomic():
            # Recheck under lock: concurrent workers must not issue duplicate reminders.
            app = candidates.select_for_update(of=("self",)).filter(pk=pk).first()
            if not app:
                continue
            pending = [
                entry for entry in checklist(app) if entry["is_required"] and entry["can_upload"]
            ]
            if not pending:
                continue  # Awaiting Registrar review is not the learner's task.
            corrections = any(entry["uploaded"] for entry in pending)
            Notification.objects.create(
                recipient_id=app.learner.owner_id,
                title="Document Corrections Needed"
                if corrections
                else "Upload Missing Requirements",
                link=f"/applications/{app.pk}",
            )
            app.last_requirements_reminder_at = now
            app.save(update_fields=["last_requirements_reminder_at"])
            record_audit_event(
                action="REQUIREMENTS_REMINDER_SENT",
                entity="Application",
                entity_id=app.pk,
                metadata={"channel": "IN_APP", "pending_count": len(pending)},
            )
            sent += 1
    return sent


class Command(BaseCommand):
    help = "Send at most one in-app requirements reminder per application every 24 hours."

    def handle(self, *args, **options):
        self.stdout.write(f"Requirements reminders sent: {send_reminders()}")
