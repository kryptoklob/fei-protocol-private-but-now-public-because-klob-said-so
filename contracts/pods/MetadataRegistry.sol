// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/// @title Metadata registry for Pods
/// @notice Exposes a single public method which should be called as part of a Pods proposal.
/// @dev Expected that a call is made to this MetadataRegistry contract as the first function call in the
/// calldata that is
contract MetadataRegistry {
    /// @notice Mapping identifying whether a particular proposal metadata was submitted for registration
    /// @dev Maps the hash of the proposal metadata to a bool identifying if it was submitted
    mapping(bytes32 => bool) public registration;

    /// @notice Event that logs the metadata associated with a pod proposal
    event RegisterProposal(
        uint256 indexed podId,
        uint256 indexed proposalId,
        string metadata
    );

    /// @notice Get whether a pod proposal has been registered
    /// @param podId Unique identifier of the pod for which metadata is being registered
    /// @param proposalId Unique identifier of the proposal for which metadata is being registered
    /// @param metadata Proposal metadata
    function isProposalRegistered(
        uint256 podId,
        uint256 proposalId,
        string memory metadata
    ) external view returns (bool) {
        bytes32 proposalHash = keccak256(
            abi.encode(podId, proposalId, metadata)
        );
        return registration[proposalHash];
    }

    /// @notice Register a pod proposal. Specifically used as a layer ontop of a Gnosis safe to emit
    ///         proposal metadata
    /// @param podId Unique identifier of the pod for which metadata is being registered
    /// @param proposalId Unique identifier of the proposal for which metadata is being registered
    /// @param metadata Proposal metadata
    function registerProposal(
        uint256 podId,
        uint256 proposalId,
        string memory metadata
    ) external {
        require(bytes(metadata).length > 0, "Metadata must be non-empty");

        bytes32 proposalHash = keccak256(
            abi.encode(podId, proposalId, metadata)
        );
        require(
            registration[proposalHash] == false,
            "Proposal already registered"
        );

        emit RegisterProposal(podId, proposalId, metadata);
        registration[proposalHash] = true;
    }
}
