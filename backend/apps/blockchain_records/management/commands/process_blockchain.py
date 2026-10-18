from django.conf import settings
from django.core.management.base import BaseCommand

from apps.admissions.models import DocumentSubmission
from apps.audit.services import record_audit_event
from apps.blockchain_records.models import BlockchainTransaction
from apps.blockchain_records.services import connection, enqueue_document, process_record


class Command(BaseCommand):
    help = "Deliver integrity events; optionally reconcile a restarted local demonstration chain."

    def add_arguments(self, parser):
        parser.add_argument("--reconcile-chain", action="store_true")
        parser.add_argument("--backfill-verified", action="store_true")

    def handle(self, *args, **options):
        if options["backfill_verified"]:
            for document in DocumentSubmission.objects.filter(review__decision="VERIFIED"):
                enqueue_document(document)
        if options["reconcile_chain"] and (settings.DEBUG or settings.CLIENT_TEST_MODE):
            try:
                web3, contract, config = connection()
                if config["chain_id"] == 31337:
                    for row in BlockchainTransaction.objects.exclude(transaction_hash=""):
                        proof = contract.functions.records(
                            bytes.fromhex(row.opaque_reference[2:])
                        ).call()
                        if not proof[2]:
                            old_hash = row.transaction_hash
                            row.transaction_hash = ""
                            row.status = "PENDING"
                            row.confirmations = 0
                            row.block_number = row.confirmed_at = row.submitted_at = None
                            row.save()
                            record_audit_event(
                                action="LOCAL_CHAIN_PROOF_LOST",
                                entity="BlockchainTransaction",
                                entity_id=row.pk,
                                metadata={
                                    "previous_transaction": old_hash,
                                    "reason": "Local chain restarted; re-anchor proof.",
                                },
                            )
            except Exception:
                self.stderr.write("Local chain unavailable; retained existing evidence for retry.")
        for pk in BlockchainTransaction.objects.exclude(status="CONFIRMED").values_list(
            "pk", flat=True
        ):
            row = process_record(pk)
            self.stdout.write(f"{row.pk}: {row.status}")
