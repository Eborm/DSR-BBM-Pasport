// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract ClaimRegistry {
    //Enums over nemen van typescript
    enum Role { Manufacturer, Owner, Inspector, Demolisher, Viewer}

    // New types are appended so the existing numeric values (and the TypeScript enum) stay valid.
    // Registration and OwnershipTransfer can only be written by the MaterialPassport contract.
    enum ClaimType { StatusChange, LocationChange, QualityDeclaration, Registration, OwnershipTransfer }

    //Claim struct
    struct Claim {
        uint256 batchId;
        address submitter;
        bytes32 documentHash;
        uint64 timestamp;
        ClaimType claimType;
    }
    //Storage
    address public admin;
    mapping(address => Role) public roles;
    mapping(uint256 => Claim[]) private claimsByBatch;
    address public passport; // the MaterialPassport contract that may write system claims
    //Events and error handeling
    event ClaimAdded(
        uint256 indexed batchId,
        uint256 indexed claimIndex,
        address indexed submitter,
        ClaimType claimType,
        bytes32 documentHash
    );

    error NotAdmin();
    error NotAllowed(address account, ClaimType claimType);
    error EmptyHash();
    error NotPassport();

    //role management
    constructor() {
        admin = msg.sender;
    }

    function setRole(address account, Role role) external {
        if (msg.sender != admin) revert NotAdmin();
        roles[account] = role;
    }

    function setPassport(address _passport) external {
        if (msg.sender != admin) revert NotAdmin();
        passport = _passport;
    }

    //claims
    function addClaim(
        uint256 batchId,
        ClaimType claimType,
        bytes32 documentHash
    ) external returns (uint256 claimIndex) {
        if (documentHash == bytes32(0)) revert EmptyHash();
        if (!_mayClaim(roles[msg.sender], claimType)) {
            revert NotAllowed(msg.sender, claimType);
        }

        claimIndex = _push(batchId, msg.sender, claimType, documentHash);
    }

    /// Used by MaterialPassport for Registration and OwnershipTransfer claims.
    /// The submitter is passed in because msg.sender here is the passport contract.
    function recordClaimFor(
        uint256 batchId,
        address submitter,
        ClaimType claimType,
        bytes32 documentHash
    ) external returns (uint256 claimIndex) {
        if (msg.sender != passport) revert NotPassport();
        if (documentHash == bytes32(0)) revert EmptyHash();
        claimIndex = _push(batchId, submitter, claimType, documentHash);
    }

    function _push(
        uint256 batchId,
        address submitter,
        ClaimType claimType,
        bytes32 documentHash
    ) private returns (uint256 claimIndex) {
        claimIndex = claimsByBatch[batchId].length;
        claimsByBatch[batchId].push(
            Claim(batchId, submitter, documentHash, uint64(block.timestamp), claimType)
        );
        emit ClaimAdded(batchId, claimIndex, submitter, claimType, documentHash);
    }

    function getClaims(uint256 batchId) external view returns (Claim[] memory) {
        return claimsByBatch[batchId];
    }

    function getClaimCount(uint256 batchId) external view returns (uint256) {
        return claimsByBatch[batchId].length;
    }

    function _mayClaim(Role role, ClaimType claimType) internal pure returns (bool) {
        if (claimType == ClaimType.QualityDeclaration) return role == Role.Inspector;
        if (claimType == ClaimType.LocationChange) return role == Role.Owner;
        // System claims can never be added by hand, only via recordClaimFor.
        if (claimType == ClaimType.Registration || claimType == ClaimType.OwnershipTransfer) return false;

        return role == Role.Owner || role == Role.Demolisher;
    }
}