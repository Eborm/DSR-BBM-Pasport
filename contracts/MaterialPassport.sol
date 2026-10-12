// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

contract MaterialPassport {
    // Enums
    enum Role { 
        Viewer, 
        Manufacturer, 
        Inspector, 
        Owner, 
        Demolisher
    }

    enum Classification {
        A1,
        A2,
        B,
        C,
        D,
        E,
        F
    }

    enum Level {
        RawMaterial,
        Product,
        Component,
        BuildingElement
    }

    enum SourceFile {
        Bim,
        InspectionReport,
        DemolitionInventory
    }

    // Registration and OwnershipTransfer are system claims: they are never written by hand only by the contract.
    enum ClaimType { 
        StatusChange, 
        LocationChange, 
        QualityDeclaration,
        Registration,
        OwnershipTransfer
    }

    // Structs
    struct Batch {
        uint256 id;
        string producer;
        Classification classification;
        string materialType;
        Level level;
        uint256 mass;
        string origin;
        uint256 productionDate;
        address currentOwner;
        uint256 registeredAt;
        SourceFile sourceFile;
    }

    struct Claim {
        uint256 batchId;
        address submitter;
        bytes32 documentHash;
        uint64 timestamp;
        ClaimType claimType;
    }

    // Events & error handling
    event BatchRegistered(
        uint256 indexed batchId, 
        address indexed registeredBy,
        uint256 timestamp
    );

    event ClaimAdded(
        uint256 indexed batchId,
        uint256 indexed claimIndex,
        address indexed submitter,
        bytes32 documentHash,
        ClaimType claimType
    );

    event OwnershipTransferred(
        uint256 indexed batchId, 
        address indexed from, 
        address indexed to
    );

    error NotAdmin();
    error WrongRole();
    error NotAllowed(address account, ClaimType claimType);
    error EmptyProducer();
    error EmptyMaterialType();
    error EmptyOrigin();
    error InvalidMass();
    error InvalidProductionDate();
    error BatchNotFound(uint256 batchId);
    error EmptyHash();
    error InvalidOwner(string reason);

    // Storage
    address public admin;
    uint256 public batchCount;
    mapping(uint256 => Batch) public batches;
    mapping(address => Role) public roles;
    mapping(uint256 => Claim[]) private claimsByBatch;

    // Role management
    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyRole(Role _role) {
        if (roles[msg.sender] != _role) revert WrongRole();
        _;
    }

    modifier mayClaim(ClaimType claimType) {
        Role role = roles[msg.sender];
        if (claimType == ClaimType.QualityDeclaration) {
            if (role != Role.Inspector) revert NotAllowed(msg.sender, claimType);
        } 
        else if (claimType == ClaimType.LocationChange) {
            if (role != Role.Owner) revert NotAllowed(msg.sender, claimType);
        } 
        else if (claimType == ClaimType.Registration || claimType == ClaimType.OwnershipTransfer) {
            // System claims can never be added by hand, only via registerBatch and transferOwnership.
            revert NotAllowed(msg.sender, claimType);
        } 
        else {
            if (role != Role.Owner && role != Role.Demolisher) revert NotAllowed(msg.sender, claimType);
        }
        _;
    }

    function setRole(address _account, Role _role) public onlyAdmin {
        roles[_account] = _role;
    }

    // Register batches
    function registerBatch(
        string memory _producer,
        Classification _classification,
        string memory _materialType,
        Level _level,
        uint256 _mass,
        string memory _origin,
        uint256 _productionDate,
        SourceFile _sourceFile,
        bytes32 _documentHash // keccak256 of the source file (BIM, inspection report, ...)
    ) public onlyRole(Role.Manufacturer) returns (uint256) {
        if (bytes(_producer).length == 0) revert EmptyProducer();
        if (bytes(_materialType).length == 0) revert EmptyMaterialType();
        if (bytes(_origin).length == 0) revert EmptyOrigin();
        if (_mass == 0) revert InvalidMass();
        if (_productionDate > block.timestamp) revert InvalidProductionDate();

        batchCount++;
        uint256 _id = batchCount;
        address _currentOwner = msg.sender;
        uint256 _registeredAt = block.timestamp;

        batches[_id] = Batch({
            id: _id,
            producer: _producer,
            classification: _classification,
            materialType: _materialType,
            level: _level,
            mass: _mass,
            origin: _origin,
            productionDate: _productionDate,
            currentOwner: _currentOwner,
            registeredAt: _registeredAt,
            sourceFile: _sourceFile
        });

        // Registration claim: ties the batch to the hash of its source document.
        pushClaim(_id, _currentOwner, ClaimType.Registration, _documentHash);

        emit BatchRegistered(_id, _currentOwner, _registeredAt);
        return _id;
    }

    /// Only the current owner can hand a batch over, and only to an Owner or Demolisher.
    /// The transfer is also written as a claim, with the hash of the transfer document.
    function transferOwnership(uint256 _batchId, address _newOwner, bytes32 _documentHash) public {
        Batch storage batch = batches[_batchId];
        if (batch.id == 0) revert BatchNotFound(_batchId);
        if (msg.sender != batch.currentOwner) revert NotAllowed(msg.sender, ClaimType.OwnershipTransfer);
        if (_newOwner == address(0)) revert InvalidOwner("New owner cannot be zero address");
        if (_newOwner == msg.sender) revert InvalidOwner("New owner cannot be the current owner");
        if (!(roles[_newOwner] == Role.Owner || roles[_newOwner] == Role.Demolisher)) revert NotAllowed(msg.sender, ClaimType.OwnershipTransfer);

        batch.currentOwner = _newOwner;

        pushClaim(_batchId, msg.sender, ClaimType.OwnershipTransfer, _documentHash);

        emit OwnershipTransferred(_batchId, msg.sender, _newOwner);
    }

    // Claims
    function addClaim(
        uint256 batchId,
        ClaimType claimType,
        bytes32 documentHash
    ) external mayClaim(claimType) returns (uint256 claimIndex) {
        if (batches[batchId].id == 0) revert BatchNotFound(batchId);

        claimIndex = pushClaim(batchId, msg.sender, claimType, documentHash);
    }

    /// Used by addClaim, and by registerBatch and transferOwnership for the system claims.
    /// The submitter is passed in so the claim is always attributed to the right account.
    function pushClaim(
        uint256 batchId,
        address submitter,
        ClaimType claimType,
        bytes32 documentHash
    ) private returns (uint256 claimIndex) {
        if (documentHash == bytes32(0)) revert EmptyHash();

        claimIndex = claimsByBatch[batchId].length;
        claimsByBatch[batchId].push(
            Claim({
                batchId: batchId,
                submitter: submitter,
                documentHash: documentHash,
                timestamp: uint64(block.timestamp),
                claimType: claimType
            })
        );

        emit ClaimAdded(batchId, claimIndex, submitter, documentHash, claimType);
    }

    function getClaims(uint256 batchId) external view returns (Claim[] memory) {
        return claimsByBatch[batchId];
    }

    function getClaimCount(uint256 batchId) external view returns (uint256) {
        return claimsByBatch[batchId].length;
    }
}