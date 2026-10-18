import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Deploy the actual integrity registry to local Hardhat (chain 31337 only)."

    def add_arguments(self, parser):
        parser.add_argument("--rpc", default="http://127.0.0.1:8545")

    def handle(self, *args, **options):
        from web3 import Web3

        if not (settings.DEBUG or settings.CLIENT_TEST_MODE):
            raise CommandError("This command is for local synthetic-data development only.")
        web3 = Web3(Web3.HTTPProvider(options["rpc"], request_kwargs={"timeout": 5}))
        if not web3.is_connected() or web3.eth.chain_id != 31337:
            raise CommandError("Start the local Hardhat node on chain 31337 first.")
        path = settings.BLOCKCHAIN_CONFIG_FILE
        if path.exists():
            existing = json.loads(path.read_text())
            address = existing.get("contract_address")
            if address and web3.eth.get_code(Web3.to_checksum_address(address)):
                self.stdout.write(f"Using existing local registry: {address}")
                return
        artifact = (
            settings.BASE_DIR.parent
            / "blockchain/artifacts/contracts/EnrollmentIntegrityRegistry.sol"
            / "EnrollmentIntegrityRegistry.json"
        )
        if not artifact.exists():
            raise CommandError("Run npm run compile in blockchain/ first.")
        data = json.loads(artifact.read_text())
        bytecode = data["bytecode"]
        if isinstance(bytecode, dict):
            bytecode = bytecode["object"]
        contract = web3.eth.contract(abi=data["abi"], bytecode=bytecode)
        transaction_hash = contract.constructor().transact({"from": web3.eth.accounts[0]})
        receipt = web3.eth.wait_for_transaction_receipt(transaction_hash)
        config = {
            "enabled": True,
            "rpc_url": options["rpc"],
            "chain_id": 31337,
            "confirmations": 1,
            "contract_address": receipt.contractAddress,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config, indent=2) + "\n")
        self.stdout.write(
            f"Deployed integrity registry: {receipt.contractAddress}\nConfiguration: {path}"
        )
