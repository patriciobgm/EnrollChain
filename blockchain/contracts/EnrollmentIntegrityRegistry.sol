// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Integrity evidence only. A hash match is not proof of original credential authenticity.
contract EnrollmentIntegrityRegistry {
    address public immutable issuer;
    struct Record { bytes32 contentHash; bytes32 eventType; uint256 recordedAt; address recordedBy; }
    mapping(bytes32 => Record) public records;
    event IntegrityRegistered(bytes32 indexed referenceId, bytes32 indexed contentHash, bytes32 indexed eventType);

    constructor() { issuer = msg.sender; }

    function register(bytes32 referenceId, bytes32 contentHash, bytes32 eventType) external {
        require(msg.sender == issuer, "Unauthorized issuer");
        require(referenceId != bytes32(0) && contentHash != bytes32(0), "Empty proof");
        Record storage existing = records[referenceId];
        if (existing.recordedAt != 0) {
            require(existing.contentHash == contentHash && existing.eventType == eventType, "Conflicting proof");
            return;
        }
        records[referenceId] = Record(contentHash, eventType, block.timestamp, msg.sender);
        emit IntegrityRegistered(referenceId, contentHash, eventType);
    }
}
