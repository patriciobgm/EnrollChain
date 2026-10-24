import uuid

from django.db import models


class TransactionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SUBMITTED = "SUBMITTED", "Submitted"
    CONFIRMED = "CONFIRMED", "Confirmed"
    FAILED = "FAILED", "Failed"


class BlockchainTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    operation_key = models.CharField(max_length=160, unique=True)
    record_type = models.CharField(max_length=64)
    opaque_reference = models.CharField(max_length=66, db_index=True)
    record_hash = models.CharField(max_length=66, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=TransactionStatus.choices,
        default=TransactionStatus.PENDING,
        db_index=True,
    )
    chain_id = models.PositiveBigIntegerField(null=True, blank=True)
    transaction_hash = models.CharField(max_length=66, blank=True, db_index=True)
    block_number = models.PositiveBigIntegerField(null=True, blank=True)
    confirmations = models.PositiveIntegerField(default=0)
    error_code = models.CharField(max_length=80, blank=True)
    error_message = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="proof_status_created_idx"),
            models.Index(fields=["record_type", "-created_at"], name="proof_type_created_idx"),
        ]

    def __str__(self):
        return f"{self.operation_key} ({self.status})"
