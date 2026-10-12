// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import "./ClaimRegistry.sol";

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

    enum ClaimType { 
        StatusChange, 
        LocationChange, 
        QualityDeclaration
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
        else {
            if (role != Role.Owner && role != Role.Demolisher) revert NotAllowed(msg.sender, claimType);
        }
        _;
    }

    function setRole(address _account, Role _role) public onlyAdmin {
        roles[_account] = _role;
    }

    ClaimRegistry public claimRegistry;

    function setClaimRegistry(address _registry) public onlyAdmin {
        claimRegistry = ClaimRegistry(_registry);
    }

    event OwnershipTransferred(uint256 indexed batchId, address indexed from, address indexed to);

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
        claimRegistry.recordClaimFor(_id, _currentOwner, ClaimRegistry.ClaimType.Registration, _documentHash);

        emit BatchRegistered(_id, _currentOwner, _registeredAt);
        return _id;
    }

    /// Only the current owner can hand a batch over, and only to an Owner or Demolisher.
    /// The transfer is also written as a claim, with the hash of the transfer document.
    function transferOwnership(uint256 _batchId, address _newOwner, bytes32 _documentHash) public {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(msg.sender == batch.currentOwner, "Only the current owner can transfer");
        require(_newOwner != address(0), "New owner cannot be the zero address");
        require(_newOwner != msg.sender, "New owner is already the owner");
        Role newRole = roles[_newOwner];
        require(newRole == Role.Owner || newRole == Role.Demolisher, "New owner must be an Owner or Demolisher");

        batch.currentOwner = _newOwner;

        claimRegistry.recordClaimFor(_batchId, msg.sender, ClaimRegistry.ClaimType.OwnershipTransfer, _documentHash);

        emit OwnershipTransferred(_batchId, msg.sender, _newOwner);
    }

    // Claims
    function addClaim(
        uint256 batchId,
        ClaimType claimType,
        bytes32 documentHash
    ) external mayClaim(claimType) returns (uint256 claimIndex) {
        if (batches[batchId].id == 0) revert BatchNotFound(batchId);
        if (documentHash == bytes32(0)) revert EmptyHash();

        claimIndex = claimsByBatch[batchId].length;
        claimsByBatch[batchId].push(
            Claim({
                batchId: batchId,
                submitter: msg.sender,
                documentHash: documentHash,
                timestamp: uint64(block.timestamp),
                claimType: claimType
            })
        );

        emit ClaimAdded(batchId, claimIndex, msg.sender, documentHash, claimType);
    }

    function getClaims(uint256 batchId) external view returns (Claim[] memory) {
        return claimsByBatch[batchId];
    }

    function getClaimCount(uint256 batchId) external view returns (uint256) {
        return claimsByBatch[batchId].length;
    }
}