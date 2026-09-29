// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

contract MaterialPassport {
    // Roles
    bytes32 public constant MANUFACTURER = keccak256("MANUFACTURER");
    bytes32 public constant INSPECTOR = keccak256("INSPECTOR");
    bytes32 public constant OWNER = keccak256("OWNER");
    bytes32 public constant DEMOLISHER = keccak256("DEMOLISHER");

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

    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;

    event BatchRegistered(uint256 indexed batchId, address indexed registeredBy, uint256 timestamp);

    function registerBatch(
        string memory _producer,
        Classification _classification,
        string memory _materialType,
        Level _level,
        uint256 _mass,
        string memory _origin,
        uint256 _productionDate,
        SourceFile _sourceFile
    ) public returns (uint256) {
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

        emit BatchRegistered(_id, _currentOwner, _registeredAt);
        return _id;
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
