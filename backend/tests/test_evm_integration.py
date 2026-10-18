"""Opt-in real EVM acceptance test (no mocked JSON-RPC)."""

import hashlib
import json
import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db


def test_real_registry_permissions_idempotence_and_integrity(settings):
    rpc = os.getenv("ENROLLCHAIN_TEST_RPC")
    if not rpc:
        pytest.skip("Set ENROLLCHAIN_TEST_RPC to a local Hardhat chain.")
    from types import SimpleNamespace

    from web3 import Web3
    from web3.exceptions import ContractLogicError, Web3RPCError

    from apps.blockchain_records.models import BlockchainTransaction
    from apps.blockchain_records.services import enqueue_event, process_record

    web3 = Web3(Web3.HTTPProvider(rpc))
    assert web3.eth.chain_id == 31337
    artifact = (
        Path(settings.BASE_DIR).parent
        / "blockchain/artifacts/contracts/EnrollmentIntegrityRegistry.sol"
        / "EnrollmentIntegrityRegistry.json"
    )
    data = json.loads(artifact.read_text())
    contract = web3.eth.contract(abi=data["abi"], bytecode=data["bytecode"])
    receipt = web3.eth.wait_for_transaction_receipt(
        contract.constructor().transact({"from": web3.eth.accounts[0]})
    )
    registry = web3.eth.contract(address=receipt.contractAddress, abi=data["abi"])
    reference, digest, kind = [
        hashlib.sha256(value).digest()
        for value in [b"reference", b"document", b"DOCUMENT_VERIFIED"]
    ]
    with pytest.raises((ContractLogicError, Web3RPCError)):
        registry.functions.register(reference, digest, kind).transact(
            {"from": web3.eth.accounts[1]}
        )
    for _ in range(2):
        tx = registry.functions.register(reference, digest, kind).transact(
            {"from": web3.eth.accounts[0]}
        )
        assert web3.eth.wait_for_transaction_receipt(tx).status == 1
    assert bytes(registry.functions.records(reference).call()[0]) == digest
    with pytest.raises((ContractLogicError, Web3RPCError)):
        registry.functions.register(reference, b"x" * 32, kind).transact(
            {"from": web3.eth.accounts[0]}
        )
    settings.DEBUG = True
    settings.BLOCKCHAIN_LOCAL_CONFIG = False
    settings.BLOCKCHAIN = {
        "enabled": True,
        "rpc_url": rpc,
        "chain_id": 31337,
        "confirmations": 1,
        "contract_address": receipt.contractAddress,
    }
    row = enqueue_event(
        SimpleNamespace(pk="synthetic-proof"), "PRE_ENROLLMENT_CONFIRMED", {"state": "confirmed"}
    )
    row = process_record(row.pk)
    assert row.status == "CONFIRMED", row.error_code
    assert row.transaction_hash and row.block_number and row.confirmations >= 1
    original = row.transaction_hash
    assert process_record(row.pk).transaction_hash == original
    assert BlockchainTransaction.objects.count() == 1

    from django.core.files.base import ContentFile

    from apps.blockchain_records.services import enqueue_document, verify_integrity
    from tests.test_admissions import pdf_bytes

    content = pdf_bytes()
    document = SimpleNamespace(
        pk="document-evidence",
        sha256=hashlib.sha256(content).hexdigest(),
        file=ContentFile(content, name="test.pdf"),
    )
    evidence = enqueue_document(document)
    assert process_record(evidence.pk).status == "CONFIRMED"
    result = verify_integrity(document)
    assert result["status"] == "UNCHANGED" and result["source"] == "BLOCKCHAIN"
    document.file = ContentFile(content + b"\n% altered", name="test.pdf")
    assert verify_integrity(document)["status"] == "INTEGRITY_VERIFICATION_FAILED"
