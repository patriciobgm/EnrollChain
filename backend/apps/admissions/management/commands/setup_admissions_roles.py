from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create milestone permission groups; assign users explicitly in Django admin."

    def handle(self, *args, **options):
        registrar = {
            "view_learner",
            "add_learner",
            "change_learner",
            "view_application",
            "add_application",
            "change_application",
            "submit_application",
            "view_documentsubmission",
            "add_documentsubmission",
            "review_document",
            "view_documentreview",
            "evaluate_application",
            "confirm_preenrollment",
            "manage_sections",
            "manage_lis",
            "view_enrollment_reports",
            "view_section",
            "view_sectionassignment",
        }
        for role in [
            "LEARNER",
            "REGISTRAR",
            "ADMINISTRATOR",
            "GUIDANCE_OFFICER",
            "CLASS_ADVISER",
        ]:
            group, _ = Group.objects.get_or_create(name=role)
            permissions = Permission.objects.filter(content_type__app_label="admissions")
            if role == "REGISTRAR":
                permissions = permissions.filter(codename__in=registrar)
            elif role == "GUIDANCE_OFFICER":
                permissions = permissions.filter(codename="complete_interview")
            elif role == "CLASS_ADVISER":
                permissions = permissions.filter(codename="view_section")
            elif role != "ADMINISTRATOR":
                permissions = permissions.none()
            # Add defaults without removing individually approved group permissions.
            group.permissions.add(*permissions)
        Group.objects.get(name="REGISTRAR").permissions.add(
            *Permission.objects.filter(
                content_type__app_label="accounts", codename__in=["view_user", "add_user"]
            )
        )
        administrators = Group.objects.get(name="ADMINISTRATOR")
        administrators.permissions.add(
            *Permission.objects.filter(
                content_type__app_label="accounts",
                codename__in=["view_user", "add_user", "change_user"],
            )
        )
        administrators.permissions.add(
            *Permission.objects.filter(content_type__app_label="audit", codename="view_auditevent")
        )
        for role in ["REGISTRAR", "ADMINISTRATOR"]:
            Group.objects.get(name=role).permissions.add(
                *Permission.objects.filter(
                    content_type__app_label="blockchain_records",
                    codename__in=["view_blockchaintransaction", "change_blockchaintransaction"],
                )
            )
        self.stdout.write(self.style.SUCCESS("Admission role groups are ready."))
