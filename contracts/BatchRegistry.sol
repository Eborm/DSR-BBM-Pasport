// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

enum Classification {
    A1,
    A2,
    B,
    C,
    D,
    E,
    F
}

enum MaterialType {
    Wood,
    Concrete,
    Glass,
    Metal
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
    MaterialType materialType;
    uint256 mass;
    string origin;
    uint256 installationDate;
    address currentOwner;
    uint256 registeredAt;
    SourceFile sourceFile;
}

contract BatchRegistry {
    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;

    event BatchRegistered(uint256 indexed batchId, address indexed registeredBy, uint256 timestamp);

    function registerBatch(
        string memory _producer,
        Classification _classification,
        MaterialType _materialType,
        uint256 _mass,
        string memory _origin,
        uint256 _installationDate,
        SourceFile _sourceFile
    ) public returns (uint256) {
        batchCount++;
        uint256 _id = batchCount;
        address _currentOwner = msg.sender;
        uint256 _registeredAt = block.timestamp;

        batches[_id] = Batch({
            id: _id,
            producer: _producer,
            classification: _classification,
            materialType: _materialType,
            mass: _mass,
            origin: _origin,
            installationDate: _installationDate,
            currentOwner: _currentOwner,
            registeredAt: _registeredAt,
            sourceFile: _sourceFile
        });

        emit BatchRegistered(_id, _currentOwner, _registeredAt);
        return _id;
    }
}