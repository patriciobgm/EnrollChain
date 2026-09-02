from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SubmissionResult:
    transaction_hash: str
    chain_id: int


class BlockchainProvider(ABC):
    """Boundary for a future EVM implementation.

    Business modules must depend on this interface instead of importing web3
    directly. No wallet or network choice is made by the foundation.
    """

    @abstractmethod
    def submit_integrity_record(
        self, *, opaque_reference: bytes, record_hash: bytes, record_type: int
    ) -> SubmissionResult:
        raise NotImplementedError


class DisabledBlockchainProvider(BlockchainProvider):
    def submit_integrity_record(
        self, *, opaque_reference: bytes, record_hash: bytes, record_type: int
    ) -> SubmissionResult:
        raise RuntimeError("Blockchain integration is disabled")
