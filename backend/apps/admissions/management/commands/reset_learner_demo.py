"""Explicit client-authorized reset, limited to the retired demo identities."""

import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.accounts.models import Notification, User
from apps.admissions.models import (
    Application,
    DocumentReview,
    DocumentSubmission,
    EnrollmentEvent,
    GuidanceInterview,
    Learner,
    LisRecord,
    SectionAssignment,
)
from apps.audit.models import AuditEvent
from apps.audit.services import record_audit_event
from apps.blockchain_records.models import BlockchainTransaction


class Command(BaseCommand):
    help = (
        "Remove Ana Cruz demo records and retired applicant accounts; provision the learner demo."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--accounts-file", required=True)

    def handle(self, *args, **options):
        if not (settings.DEBUG or settings.CLIENT_TEST_MODE):
            raise CommandError(
                "This command is restricted to development/client-test environments."
            )
        data = json.loads(Path(options["accounts_file"]).read_text())
        credentials = next(
            (row for row in data if row["email"] == "learner@enrollchain.test"), None
        )
        if not credentials:
            raise CommandError("The private account file must contain learner@enrollchain.test.")
        retired = User.objects.filter(
            email__in=["applicant@enrollchain.test", "applicant2@enrollchain.test"]
        )
        learners = Learner.objects.filter(first_name__iexact="Ana", last_name__iexact="Cruz")
        if Learner.objects.filter(owner__in=retired).exclude(pk__in=learners).exists():
            raise CommandError("A retired account owns an unrelated learner. No data was changed.")
        apps = Application.objects.filter(learner__in=learners)
        docs = DocumentSubmission.objects.filter(application__in=apps)
        identities = {
            "Learner": list(learners.values_list("pk", flat=True)),
            "Application": list(apps.values_list("pk", flat=True)),
            "DocumentSubmission": list(docs.values_list("pk", flat=True)),
            "DocumentReview": list(
                DocumentReview.objects.filter(document__in=docs).values_list("pk", flat=True)
            ),
            "EnrollmentEvent": list(
                EnrollmentEvent.objects.filter(application__in=apps).values_list("pk", flat=True)
            ),
            "GuidanceInterview": list(
                GuidanceInterview.objects.filter(application__in=apps).values_list("pk", flat=True)
            ),
            "SectionAssignment": list(
                SectionAssignment.objects.filter(application__in=apps).values_list("pk", flat=True)
            ),
            "LisRecord": list(
                LisRecord.objects.filter(application__in=apps).values_list("pk", flat=True)
            ),
        }
        identities["User"] = list(retired.values_list("pk", flat=True))
        files = [(doc.file.storage, doc.file.name) for doc in docs]
        proof_filter = Q(pk__in=[])
        for key in [*identities["Application"], *identities["DocumentSubmission"]]:
            proof_filter |= Q(operation_key__endswith=f":{key}")
        proofs = BlockchainTransaction.objects.filter(proof_filter)
        summary = {
            "learners": learners.count(),
            "applications": apps.count(),
            "files": len(files),
            "retired_accounts": retired.count(),
            "confirmed_chain_records": proofs.filter(status="CONFIRMED").count(),
        }
        self.stdout.write(json.dumps(summary))
        if not options["apply"]:
            return
        with transaction.atomic():
            for key in identities["Application"]:
                Notification.objects.filter(link__endswith=str(key)).delete()
            for entity, ids in identities.items():
                AuditEvent.objects.filter(
                    entity=entity, entity_id__in=[str(key) for key in ids]
                ).delete()
            AuditEvent.objects.filter(user__in=retired).delete()
            proofs.delete()
            DocumentReview.objects.filter(pk__in=identities["DocumentReview"]).delete()
            docs.delete()
            EnrollmentEvent.objects.filter(application__in=apps).delete()
            GuidanceInterview.objects.filter(application__in=apps).delete()
            LisRecord.objects.filter(application__in=apps).delete()
            SectionAssignment.objects.filter(application__in=apps).delete()
            apps.delete()
            learners.delete()
            OutstandingToken.objects.filter(user__in=retired).delete()
            retired.delete()
            user, created = User.objects.get_or_create(
                email=credentials["email"], defaults={"role": "LEARNER"}
            )
            if created:
                user.set_password(credentials["password"])
                user.save()
            user.groups.add(Group.objects.get(name="LEARNER"))
            record_audit_event(action="DEMO_LEARNER_RESET", entity="DemoReset", metadata=summary)
        # Delete only the exact private objects from the committed reset.
        for storage, name in files:
            storage.delete(name)
        self.stdout.write("Demo reset complete. Other users and records were preserved.")
