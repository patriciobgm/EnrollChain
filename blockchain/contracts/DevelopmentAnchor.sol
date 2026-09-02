// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DevelopmentAnchor
/// @notice A non-production smoke contract for validating the local Hardhat toolchain.
/// @dev The final contract awaits client decisions on authority, revocation, and networks.
contract DevelopmentAnchor {
    event IntegrityAnchored(bytes32 indexed opaqueReference, bytes32 indexed contentHash);

    function anchor(bytes32 opaqueReference, bytes32 contentHash) external {
        require(opaqueReference != bytes32(0), "Empty reference");
        require(contentHash != bytes32(0), "Empty hash");
        emit IntegrityAnchored(opaqueReference, contentHash);
    }
}
