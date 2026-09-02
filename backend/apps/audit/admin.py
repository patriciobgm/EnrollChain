from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "entity", "entity_id", "user", "ip_address")
    list_filter = ("action", "entity", "created_at")
    search_fields = ("entity_id", "user__email")
    readonly_fields = (
        "id",
        "user",
        "action",
        "entity",
        "entity_id",
        "ip_address",
        "metadata",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
