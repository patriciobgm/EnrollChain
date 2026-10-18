from rest_framework.permissions import BasePermission

STAFF_ROLES = {"REGISTRAR", "ADMINISTRATOR", "GUIDANCE_OFFICER", "CLASS_ADVISER"}


def staff_can(user, permission):
    return user.is_authenticated and (
        user.is_superuser
        or (user.role in STAFF_ROLES and user.has_perm(f"admissions.{permission}"))
    )


class AdmissionsPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if getattr(view, "configuration", False) and request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        if view.action == "link_applicant":
            return user.role in {"REGISTRAR", "ADMINISTRATOR"} and staff_can(user, "change_learner")
        if view.action in {"review", "review_queue"}:
            if view.action == "review":
                return (
                    user.role == "REGISTRAR"
                    and staff_can(user, "review_document")
                    and staff_can(user, "view_documentsubmission")
                )
            return (
                user.role in {"REGISTRAR", "ADMINISTRATOR"}
                and staff_can(user, "view_documentsubmission")
                and staff_can(user, "view_documentreview")
            )
        if not getattr(view, "configuration", False) and user.role == "LEARNER":
            return True  # Querysets and serializers enforce ownership on every object/relation.
        verb = {
            "list": "view",
            "retrieve": "view",
            "create": "add",
            "update": "change",
            "partial_update": "change",
            "destroy": "delete",
            "requirements": "view",
            "download": "view",
            "submit": "submit",
        }.get(view.action, "view")
        return staff_can(user, f"{verb}_{view.queryset.model._meta.model_name}")
