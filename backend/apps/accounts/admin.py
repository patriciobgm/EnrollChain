from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .admin_security import MFAAdminAuthenticationForm
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    def save_model(self, request, obj, form, change):
        from apps.audit.services import record_audit_event

        if change:
            obj.security_version += 1
        super().save_model(request, obj, form, change)
        record_audit_event(
            action="ADMIN_UPDATE_USER" if change else "ADMIN_CREATE_USER",
            entity="User",
            entity_id=obj.pk,
            user=request.user,
            request=request,
        )

    ordering = ("email",)
    list_display = ("email", "role", "is_active", "is_staff", "created_at")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal information", {"fields": ("first_name", "last_name")}),
        (
            "Authorization",
            {
                "fields": (
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "role", "is_staff", "is_active"),
            },
        ),
    )


admin.site.login_form = MFAAdminAuthenticationForm
admin.site.login_template = "admin/secure_login.html"
admin.site.site_header = "EnrollChain technical administration"
# School administrators use the capability-checked React workspace. Django's broad
# user/group editing is reserved for technical superusers to prevent self-promotion.
admin.site.has_permission = lambda request: request.user.is_active and request.user.is_superuser
