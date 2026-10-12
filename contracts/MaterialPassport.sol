// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import "./ClaimRegistry.sol";

contract MaterialPassport {
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

    mapping(address => Role) public roles;
    address public admin;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role, "Caller does not have the required role");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can assign roles");
        _;
    }

    function assignRole(address _account, Role _role) public onlyAdmin {
        roles[_account] = _role;
    }

    ClaimRegistry public claimRegistry;

    function setClaimRegistry(address _registry) public onlyAdmin {
        claimRegistry = ClaimRegistry(_registry);
    }

    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;

    event BatchRegistered(uint256 indexed batchId, address indexed registeredBy, uint256 timestamp);
    event OwnershipTransferred(uint256 indexed batchId, address indexed from, address indexed to);

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
        _validateBatchInput(_producer, _materialType, _mass, _origin, _productionDate);

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

    function _validateBatchInput(
        string memory _producer,
        string memory _materialType,
        uint256 _mass,
        string memory _origin,
        uint256 _productionDate
    ) private view {
        require(bytes(_producer).length > 0, "Producer cannot be empty");
        require(bytes(_materialType).length > 0, "Material type cannot be empty");
        require(bytes(_origin).length > 0, "Origin cannot be empty");
        require(_mass > 0, "Mass must be greater than zero");
        require(_productionDate <= block.timestamp, "Production date cannot be in the future");
    }
}
