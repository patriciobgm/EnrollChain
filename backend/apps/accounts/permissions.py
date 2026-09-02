from rest_framework.permissions import BasePermission


class HasAnyRole(BasePermission):
    """Base permission for views that declare an `allowed_roles` collection."""

    message = "Your account role does not permit this action."

    def has_permission(self, request, view):
        allowed_roles = getattr(view, "allowed_roles", ())
        return bool(request.user.is_authenticated and request.user.role in allowed_roles)
