# Blockchain development environment

This folder validates Solidity compilation and provides a local Hardhat JSON-RPC node. `DevelopmentAnchor.sol` is intentionally a smoke contract, not the approved production registry.

The final contract is deferred until the client confirms:

- Network and wallet ownership
- Registrar/administrator signing authority
- Confirmation policy
- Correction, supersession, and revocation behavior
- Which admission and registration events must be anchored

No personal information may be included in contract arguments or events.
