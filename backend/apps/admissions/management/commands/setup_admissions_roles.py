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
        }
        for role in [
            "APPLICANT",
            "REGISTRAR",
            "ADMINISTRATOR",
            "GUIDANCE_OFFICER",
            "CLASS_ADVISER",
        ]:
            group, _ = Group.objects.get_or_create(name=role)
            permissions = Permission.objects.filter(content_type__app_label="admissions")
            if role == "REGISTRAR":
                permissions = permissions.filter(codename__in=registrar)
            elif role != "ADMINISTRATOR":
                permissions = permissions.none()
            # Add defaults without removing individually approved group permissions.
            group.permissions.add(*permissions)
        self.stdout.write(self.style.SUCCESS("Admission role groups are ready."))
