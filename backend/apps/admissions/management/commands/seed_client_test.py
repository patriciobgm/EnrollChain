"""Idempotent synthetic configuration for the separate Docker client test database."""

import json
import os
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.admissions.models import AdmissionPeriod, Program, SchoolYear, Section
from apps.admissions.services import seed_period_requirements
from apps.audit.services import record_audit_event


class Command(BaseCommand):
    help = "Provision isolated client-demo accounts and clearly labeled synthetic programs."

    def add_arguments(self, parser):
        parser.add_argument("--accounts-file")
        parser.add_argument("--accounts-only", action="store_true")
        parser.add_argument("--sync-existing", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.CLIENT_TEST_MODE and not (settings.DEBUG and options["accounts_only"]):
            raise CommandError("This command requires CLIENT_TEST_MODE=true.")
        path = options["accounts_file"] or os.getenv("CLIENT_TEST_ACCOUNTS_FILE", "")
        if not path:
            raise CommandError("Provide the private CLIENT_TEST_ACCOUNTS_FILE.")
        entries = json.loads(Path(path).read_text())
        allowed = {
            f"{name}@enrollchain.test"
            for name in ("superadmin", "admin", "registrar", "guidance", "adviser", "learner")
        }
        if any(entry["email"] not in allowed for entry in entries):
            raise CommandError("Only the six named EnrollChain demo accounts may be seeded.")
        users = {}
        for entry in entries:
            user, created = User.objects.get_or_create(
                email=entry["email"],
                defaults={
                    "role": entry["role"],
                    "is_superuser": entry["superuser"],
                },
            )
            if created:
                user.set_password(entry["password"])
                user.save(update_fields=["password"])
                user.groups.add(Group.objects.get(name=entry["role"]))
                record_audit_event(
                    action="CLIENT_TEST_ACCOUNT_CREATED",
                    entity="User",
                    entity_id=user.pk,
                    metadata={"synthetic": True},
                )
            if not created and options["sync_existing"]:
                changed = (
                    user.role != entry["role"]
                    or user.is_superuser != entry["superuser"]
                    or not user.is_active
                    or not user.check_password(entry["password"])
                )
                if changed:
                    user.role = entry["role"]
                    user.is_superuser = entry["superuser"]
                    user.is_active = True
                    user.set_password(entry["password"])
                    user.security_version += 1
                    user.save()
                    record_audit_event(
                        action="CLIENT_TEST_ACCOUNT_SYNCHRONIZED",
                        entity="User",
                        entity_id=user.pk,
                        metadata={"synthetic": True},
                    )
                user.groups.add(Group.objects.get(name=entry["role"]))
            users[entry["email"]] = user
        if options["accounts_only"]:
            self.stdout.write(
                "Demo accounts ready; school configuration and learner records unchanged."
            )
            return
        today = timezone.localdate()
        year, _ = SchoolYear.objects.get_or_create(
            name="DEMO school year",
            defaults={
                "starts_on": today - timedelta(days=30),
                "ends_on": today + timedelta(days=365),
            },
        )
        period, created = AdmissionPeriod.objects.get_or_create(
            name="DEMO early enrollment",
            school_year=year,
            defaults={
                "opens_on": today - timedelta(days=1),
                "closes_on": today + timedelta(days=90),
            },
        )
        if created:
            seed_period_requirements(period)
        for track, label, capacity in [
            ("ACADEMIC", "Academic", 40),
            ("TECHNICAL_PROFESSIONAL", "TechPro", 25),
        ]:
            program, _ = Program.objects.get_or_create(
                name=f"DEMO {label} program", track=track, defaults={"code": f"DEMO-{label}"}
            )
            for grade in [11, 12]:
                Section.objects.get_or_create(
                    code=f"DEMO-{label}-{grade}-A",
                    school_year=year,
                    defaults={
                        "name": f"DEMO {label} {grade}-A",
                        "track_id": track,
                        "program": program,
                        "grade_level": grade,
                        "capacity": capacity,
                        "adviser": users.get("adviser@enrollchain.test"),
                    },
                )
        self.stdout.write(
            "Client-test accounts and DEMO configuration ready; existing passwords preserved."
        )
