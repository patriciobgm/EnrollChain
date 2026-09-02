from django.contrib import admin

from .models import BlockchainTransaction


@admin.register(BlockchainTransaction)
class BlockchainTransactionAdmin(admin.ModelAdmin):
    list_display = ("operation_key", "record_type", "status", "chain_id", "created_at")
    list_filter = ("status", "record_type", "chain_id")
    search_fields = ("operation_key", "transaction_hash", "opaque_reference")
    readonly_fields = ("created_at", "updated_at")
