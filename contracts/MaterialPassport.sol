// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BBM-paspoort
/// @notice Register dat per materiaalbatch een onvervalsbare, groeiende historie
///         bijhoudt. Op de keten staat alleen de huidige stand van een batch plus
///         een bewijs (hash en verwijzing) over documenten die buiten de keten
///         staan. De historie leeft in events: append-only en niet te wijzigen.
/// @dev    ERC-1155: het token-ID is het batch-ID, het saldo is het aantal
///         eenheden. Invariant: `balanceOf(batch.owner, id) == batch.quantity`.
contract MaterialPassport is ERC1155, AccessControl, ReentrancyGuard {
    // ------------------------------------------------------------------ Rollen

    bytes32 public constant MANUFACTURER = keccak256("MANUFACTURER");
    bytes32 public constant INSPECTOR = keccak256("INSPECTOR");
    bytes32 public constant OWNER = keccak256("OWNER");
    bytes32 public constant DEMOLISHER = keccak256("DEMOLISHER");

    // ------------------------------------------------- Soorten gebeurtenissen

    bytes32 public constant REGISTRATION = keccak256("registration");
    bytes32 public constant INSPECTION = keccak256("inspection");
    bytes32 public constant PLACEMENT = keccak256("placement");
    bytes32 public constant TRANSFER = keccak256("transfer");
    bytes32 public constant SPLIT = keccak256("split");
    bytes32 public constant DEMOLITION = keccak256("demolition");
    bytes32 public constant REUSE = keccak256("reuse");

    // ------------------------------------------------------------------- Typen

    enum Level {
        RawMaterial,
        Product,
        Component,
        BuildingElement
    }

    /// @notice De huidige stand van een materiaalbatch. Historie staat niet hier
    ///         maar in de events.
    struct Batch {
        uint256 id;
        string materialType;
        uint256 quantity;
        string unit;
        Level level;
        string origin;
        uint64 productionDate;
        address registrant;
        address owner;
        string metadataURI;
        uint256 parentId;
        bool exists;
    }

    /// @notice Invoer voor `registerBatch`. Als struct omdat losse parameters
    ///         tot "Stack too deep" leiden.
    /// @dev    `metadataHash` is de keccak256 over de bytes van het
    ///         paspoortdocument op `metadataURI`. Verplicht zodra er een URI is.
    struct BatchInput {
        string materialType;
        uint256 quantity;
        string unit;
        Level level;
        string origin;
        uint64 productionDate;
        string metadataURI;
        bytes32 metadataHash;
    }

    // ------------------------------------------------------------------ Events

    /// @notice Eén regel op de tijdlijn van een batch. Alle handelingen gebruiken
    ///         dit ene event; ze verschillen alleen in `kind`.
    event TimelineEvent(
        uint256 indexed batchId,
        bytes32 indexed kind,
        address indexed actor,
        uint64 timestamp,
        string documentURI,
        bytes32 documentHash,
        string description
    );

    /// @notice Een claim met bewijs. `documentHash` is geïndexeerd zodat je een
    ///         document op zijn hash kunt terugvinden.
    event ClaimAdded(uint256 indexed batchId, bytes32 indexed documentHash, address indexed actor, bytes32 kind);

    /// @notice Vertakking: `childId` is uit `parentId` ontstaan.
    event BatchSplit(uint256 indexed parentId, uint256 indexed childId, uint256 amount);

    // ------------------------------------------------------------------ Errors

    error UnknownBatch(uint256 batchId);
    error NotOwner(uint256 batchId, address account);
    error EmptyHash();
    error ZeroQuantity();
    error EmptyMaterialType();
    error EmptyUnit();
    error EmptyDocumentURI();
    error InvalidAmount(uint256 amount, uint256 available);
    error KindNotClaimable(bytes32 kind);
    error NotAllowedToTransfer(address account);
    error ZeroAddress();
    error InspectorCannotOwn(address account);
    error RecipientWithoutOwnerRole(address account);
    error DirectTransferDisabled();

    // ------------------------------------------------------------------- Opslag

    mapping(uint256 => Batch) private _batches;
    uint256 private _batchCount;

    constructor(address admin) ERC1155("") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------- Schrijven

    /// @notice Registreert een nieuwe batch. De registrant wordt eerste eigenaar.
    function registerBatch(BatchInput calldata input)
        external
        onlyRole(MANUFACTURER)
        nonReentrant
        returns (uint256 batchId)
    {
        if (bytes(input.materialType).length == 0) revert EmptyMaterialType();
        if (input.quantity == 0) revert ZeroQuantity();
        if (bytes(input.unit).length == 0) revert EmptyUnit();
        if (bytes(input.metadataURI).length != 0 && input.metadataHash == bytes32(0)) revert EmptyHash();
        _checkNotInspector(msg.sender);

        batchId = ++_batchCount;
        Batch storage batch = _batches[batchId];
        batch.id = batchId;
        batch.materialType = input.materialType;
        batch.quantity = input.quantity;
        batch.unit = input.unit;
        batch.level = input.level;
        batch.origin = input.origin;
        batch.productionDate = input.productionDate;
        batch.registrant = msg.sender;
        batch.owner = msg.sender;
        batch.metadataURI = input.metadataURI;
        batch.exists = true;

        emit TimelineEvent(batchId, REGISTRATION, msg.sender, _now(), input.metadataURI, input.metadataHash, "");

        // Interactie als laatste: _mint roept bij een contract-ontvanger
        // onERC1155Received aan.
        _mint(msg.sender, batchId, input.quantity, "");
    }

    /// @notice Voegt een claim met bewijs toe aan de tijdlijn. Claims worden nooit
    ///         overschreven; tegenstrijdige claims blijven naast elkaar staan.
    /// @dev    Rechten per soort:
    ///         - inspection: INSPECTOR, op elke batch
    ///         - demolition: DEMOLISHER, op elke batch
    ///         - placement, reuse: OWNER, alleen op eigen batches
    ///         registration, transfer en split zijn voorbehouden aan hun eigen
    ///         functie, zodat niemand een overdracht of splitsing kan veinzen.
    function addClaim(
        uint256 batchId,
        bytes32 kind,
        bytes32 documentHash,
        string calldata documentURI,
        string calldata description
    ) external {
        Batch storage batch = _existingBatch(batchId);
        _checkClaimRights(batch, kind);
        if (documentHash == bytes32(0)) revert EmptyHash();
        if (bytes(documentURI).length == 0) revert EmptyDocumentURI();

        emit ClaimAdded(batchId, documentHash, msg.sender, kind);
        emit TimelineEvent(batchId, kind, msg.sender, _now(), documentURI, documentHash, description);
    }

    /// @notice Draagt een hele batch over. Voor een deel van een batch: `splitBatch`.
    /// @param amount Moet gelijk zijn aan de hoeveelheid van de batch; expliciet
    ///        opgegeven zodat de afzender bevestigt wat er overgaat.
    function transferOwnership(uint256 batchId, address to, uint256 amount) external nonReentrant {
        Batch storage batch = _existingBatch(batchId);
        if (!hasRole(MANUFACTURER, msg.sender) && !hasRole(OWNER, msg.sender)) {
            revert NotAllowedToTransfer(msg.sender);
        }
        if (batch.owner != msg.sender) revert NotOwner(batchId, msg.sender);
        _checkRecipient(to);
        if (amount != batch.quantity) revert InvalidAmount(amount, batch.quantity);

        batch.owner = to;

        emit TimelineEvent(batchId, TRANSFER, msg.sender, _now(), "", bytes32(0), "");

        _safeTransferFrom(msg.sender, to, batchId, amount, "");
    }

    /// @notice Splitst `amount` eenheden af naar een nieuwe batch voor `to`. De
    ///         nieuwe batch verwijst via `parentId` naar deze; de gedeelde historie
    ///         vóór de splitsing blijft voor beide takken geldig.
    function splitBatch(uint256 batchId, uint256 amount, address to)
        external
        onlyRole(OWNER)
        nonReentrant
        returns (uint256 newBatchId)
    {
        Batch storage parent = _existingBatch(batchId);
        if (parent.owner != msg.sender) revert NotOwner(batchId, msg.sender);
        _checkRecipient(to);
        if (amount == 0) revert ZeroQuantity();
        if (amount >= parent.quantity) revert InvalidAmount(amount, parent.quantity);

        parent.quantity -= amount;

        newBatchId = ++_batchCount;
        Batch storage child = _batches[newBatchId];
        child.id = newBatchId;
        child.materialType = parent.materialType;
        child.quantity = amount;
        child.unit = parent.unit;
        child.level = parent.level;
        child.origin = parent.origin;
        child.productionDate = parent.productionDate;
        child.registrant = msg.sender;
        child.owner = to;
        child.metadataURI = parent.metadataURI;
        child.parentId = batchId;
        child.exists = true;

        uint64 timestamp = _now();
        emit TimelineEvent(batchId, SPLIT, msg.sender, timestamp, "", bytes32(0), "");
        emit TimelineEvent(newBatchId, SPLIT, msg.sender, timestamp, "", bytes32(0), "");
        emit BatchSplit(batchId, newBatchId, amount);

        _burn(msg.sender, batchId, amount);
        _mint(to, newBatchId, amount, "");
    }

    // ------------------------------------------------------------------- Lezen

    function getBatch(uint256 batchId) external view returns (Batch memory) {
        return _existingBatch(batchId);
    }

    function batchCount() external view returns (uint256) {
        return _batchCount;
    }

    /// @notice ERC-1155-metadata wijst naar het JSON-LD paspoortdocument.
    function uri(uint256 batchId) public view override returns (string memory) {
        return _batches[batchId].metadataURI;
    }

    // --------------------------------------------------- ERC-1155-afscherming

    /// @dev Directe tokenoverdrachten zijn uitgeschakeld: ze zouden de rolcontrole
    ///      en de tijdlijn omzeilen en `owner` uit de pas laten lopen met het saldo.
    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert DirectTransferDisabled();
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        pure
        override
    {
        revert DirectTransferDisabled();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------- Intern

    function _existingBatch(uint256 batchId) private view returns (Batch storage batch) {
        batch = _batches[batchId];
        if (!batch.exists) revert UnknownBatch(batchId);
    }

    function _checkClaimRights(Batch storage batch, bytes32 kind) private view {
        if (kind == INSPECTION) {
            _checkRole(INSPECTOR);
        } else if (kind == DEMOLITION) {
            _checkRole(DEMOLISHER);
        } else if (kind == PLACEMENT || kind == REUSE) {
            _checkRole(OWNER);
            if (batch.owner != msg.sender) revert NotOwner(batch.id, msg.sender);
        } else {
            revert KindNotClaimable(kind);
        }
    }

    /// @dev Een inspecteur mag geen eigenaar zijn of worden: wie keurt, mag er
    ///      geen belang bij hebben.
    function _checkNotInspector(address account) private view {
        if (hasRole(INSPECTOR, account)) revert InspectorCannotOwn(account);
    }

    /// @dev Wie een batch ontvangt, moet de rol OWNER hebben; anders kan niemand
    ///      de batch nog overdragen, splitsen of plaatsen en zit hij vast.
    function _checkRecipient(address to) private view {
        if (to == address(0)) revert ZeroAddress();
        _checkNotInspector(to);
        if (!hasRole(OWNER, to)) revert RecipientWithoutOwnerRole(to);
    }

    function _now() private view returns (uint64) {
        return uint64(block.timestamp);
    }
}
