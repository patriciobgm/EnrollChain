"""Durable integrity queue and real EVM transaction reconciliation."""

import hashlib
import json

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit_event

from .models import BlockchainTransaction

ABI = [
    {
        "type": "function",
        "name": "issuer",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "address", "name": ""}],
    },
    {
        "type": "function",
        "name": "register",
        "stateMutability": "nonpayable",
        "inputs": [
            {"type": "bytes32", "name": "referenceId"},
            {"type": "bytes32", "name": "contentHash"},
            {"type": "bytes32", "name": "eventType"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "records",
        "stateMutability": "view",
        "inputs": [{"type": "bytes32", "name": ""}],
        "outputs": [
            {"type": "bytes32", "name": "contentHash"},
            {"type": "bytes32", "name": "eventType"},
            {"type": "uint256", "name": "recordedAt"},
            {"type": "address", "name": "recordedBy"},
        ],
    },
]


def configuration():
    config = dict(settings.BLOCKCHAIN)
    local = settings.BLOCKCHAIN_CONFIG_FILE
    if (
        (settings.DEBUG or settings.CLIENT_TEST_MODE)
        and settings.BLOCKCHAIN_LOCAL_CONFIG
        and local.exists()
        and not config["contract_address"]
    ):
        config.update(json.loads(local.read_text()))
        config["enabled"] = True
    return config


def connection():
    from web3 import Web3

    config = configuration()
    if not config["enabled"] or not config["contract_address"]:
        raise RuntimeError("Blockchain connection has not been configured.")
    web3 = Web3(Web3.HTTPProvider(config["rpc_url"], request_kwargs={"timeout": 5}))
    if not web3.is_connected():
        raise RuntimeError("Blockchain RPC is unavailable.")
    if web3.eth.chain_id != config["chain_id"]:
        raise RuntimeError("Connected chain does not match the configured chain ID.")
    contract = web3.eth.contract(
        address=Web3.to_checksum_address(config["contract_address"]), abi=ABI
    )
    if not web3.eth.get_code(contract.address):
        raise RuntimeError("The configured contract is not deployed on this chain.")
    return web3, contract, config


def enqueue_event(instance, event_type, payload):
    key = f"{event_type}:{instance.pk}"
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()
    return _enqueue(key, event_type, digest)


def enqueue_document(document):
    return _enqueue(f"DOCUMENT_VERIFIED:{document.pk}", "DOCUMENT_VERIFIED", document.sha256)


def _enqueue(key, event_type, digest):
    row, created = BlockchainTransaction.objects.get_or_create(
        operation_key=key,
        defaults={
            "record_type": event_type,
            "opaque_reference": "0x" + hashlib.sha256(key.encode()).hexdigest(),
            "record_hash": digest,
        },
    )
    if row.record_hash != digest:
        raise ValidationError("Conflicting integrity evidence for an existing event.")
    # Delivery happens outside the workflow transaction. Failures remain visible/retryable.
    if created and configuration()["enabled"]:
        transaction.on_commit(lambda: process_record(row.pk))
    return row


def process_record(pk):
    try:
        web3, contract, config = connection()
        with transaction.atomic():
            row = BlockchainTransaction.objects.select_for_update().get(pk=pk)
            reference = bytes.fromhex(row.opaque_reference.removeprefix("0x"))
            expected = bytes.fromhex(row.record_hash.removeprefix("0x"))
            kind = hashlib.sha256(row.record_type.encode()).digest()
            found = contract.functions.records(reference).call()
            if found[2] and (bytes(found[0]) != expected or bytes(found[1]) != kind):
                raise RuntimeError("On-chain proof conflicts with this record.")
            if not row.transaction_hash:
                # Unlocked accounts are restricted to the explicitly local Hardhat chain.
                if config["chain_id"] != 31337 or not (settings.DEBUG or settings.CLIENT_TEST_MODE):
                    raise RuntimeError(
                        "Production signer custody must be configured before non-local writes."
                    )
                issuer = contract.functions.issuer().call()
                if issuer not in web3.eth.accounts:
                    raise RuntimeError("The local issuer account is not available.")
                tx_hash = contract.functions.register(reference, expected, kind).transact(
                    {"from": issuer}
                )
                row.transaction_hash = web3.to_hex(tx_hash)
                row.chain_id = config["chain_id"]
                row.submitted_at = timezone.now()
                row.status = "SUBMITTED"
                row.save()
        # Save transaction identity before waiting, so a timeout never loses the submission.
        receipt = web3.eth.wait_for_transaction_receipt(
            row.transaction_hash, timeout=8, poll_latency=0.1
        )
        if receipt.status != 1:
            raise RuntimeError("The integrity transaction was reverted.")
        found = contract.functions.records(reference).call()
        if bytes(found[0]) != expected or bytes(found[1]) != kind:
            raise RuntimeError("Receipt exists but integrity evidence does not match.")
        confirmations = web3.eth.block_number - receipt.blockNumber + 1
        with transaction.atomic():
            row = BlockchainTransaction.objects.select_for_update().get(pk=pk)
            old = row.status
            row.status = "CONFIRMED" if confirmations >= config["confirmations"] else "SUBMITTED"
            row.block_number = receipt.blockNumber
            row.confirmations = confirmations
            row.confirmed_at = timezone.now() if row.status == "CONFIRMED" else None
            row.error_code = row.error_message = ""
            row.save()
            if old != row.status:
                record_audit_event(
                    action="BLOCKCHAIN_" + row.status,
                    entity="BlockchainTransaction",
                    entity_id=row.pk,
                    metadata={"transaction_hash": row.transaction_hash, "chain_id": row.chain_id},
                )
        return row
    except Exception as exc:
        # No credentials, RPC URL or wallet details in user-visible errors.
        BlockchainTransaction.objects.filter(pk=pk).update(
            status="FAILED",
            error_code=type(exc).__name__,
            error_message=(
                "Blockchain delivery is unavailable or unconfirmed. "
                "Reconcile/retry when the configured chain is available."
            ),
        )
        return BlockchainTransaction.objects.get(pk=pk)


def verify_integrity(document, upload=None):
    from apps.admissions.services import validate_pdf

    if upload is not None:
        current, _ = validate_pdf(upload)
    else:
        try:
            with document.file.open("rb") as file:
                current = hashlib.file_digest(file, "sha256").hexdigest()
        except OSError as exc:
            raise ValidationError("The stored document is unavailable.") from exc
    row = BlockchainTransaction.objects.filter(
        operation_key=f"DOCUMENT_VERIFIED:{document.pk}"
    ).first()
    expected = document.sha256
    source = "DATABASE_UPLOAD_HASH"
    chain_status = row.status if row else "NOT_ANCHORED"
    if row and row.status == "CONFIRMED":
        try:
            _, contract, _ = connection()
            found = contract.functions.records(bytes.fromhex(row.opaque_reference[2:])).call()
            if not found[2]:
                return {
                    "status": "UNAVAILABLE",
                    "source": "BLOCKCHAIN",
                    "blockchain_status": "PROOF_NOT_FOUND",
                    "current_hash": current,
                    "expected_hash": None,
                }
            expected = bytes(found[0]).hex()
            source = "BLOCKCHAIN"
        except Exception:
            return {
                "status": "UNAVAILABLE",
                "source": "BLOCKCHAIN",
                "blockchain_status": "UNAVAILABLE",
                "current_hash": current,
                "expected_hash": None,
            }
    return {
        "status": "UNCHANGED" if current == expected else "INTEGRITY_VERIFICATION_FAILED",
        "source": source,
        "blockchain_status": chain_status,
        "current_hash": current,
        "expected_hash": expected,
    }
