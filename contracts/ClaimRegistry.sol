pragma solidity ^0.8.28;

contract ClaimRegistry {
    //Enums over nemen van typescript
    enum Role { Manufacturer, Owner, Inspector, Demolisher, Viewer}

    enum ClaimType { StatusChange, LocationChange, QualityDeclaration}

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

    //role management
    constructor() {
        admin = msg.sender;
    }

    function setRole(address account, Role role) external {
        if (msg.sender != admin) revert NotAdmin();
        roles[account] = role;
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

        claimIndex = claimsByBatch[batchId].length;
        claimsByBatch[batchId].push(
            Claim(batchId, msg.sender, documentHash, uint64(block.timestamp), claimType)
        );

        emit ClaimAdded(batchId, claimIndex, msg.sender, claimType, documentHash);
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

        return role == Role.Owner || role == Role.Demolisher;
    }
}