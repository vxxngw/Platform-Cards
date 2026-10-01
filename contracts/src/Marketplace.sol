// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CardCollection} from "./CardCollection.sol";

/// @title Marketplace — chợ P2P giá cố định, escrow thẻ, pull payment
contract Marketplace is ERC1155Holder, AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint256 public constant MAX_FEE_BPS = 1000; // 10%

    struct Listing { address seller; uint256[] ids; uint256[] amounts; uint256 price; bool active; bool isBundle; }

    CardCollection public immutable collection;
    uint256 public feeBps = 250; // 2.5%
    uint256 public nextListingId = 1;
    uint256 public accruedFees;

    mapping(uint256 => Listing) internal _listings;
    mapping(address => uint256) public pendingWithdrawals;

    event Listed(uint256 indexed listingId, address indexed seller, uint256[] ids, uint256[] amounts, uint256 price, bool isBundle);
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price);
    event Cancelled(uint256 indexed listingId);
    event Withdrawn(address indexed to, uint256 amount);
    event FeeUpdated(uint256 bps);

    error InvalidPrice();
    error InvalidAmount();
    error NotActive();
    error WrongValue();
    error SelfBuy();
    error NotSeller();
    error NothingToWithdraw();
    error FeeTooHigh();

    constructor(CardCollection collection_) {
        collection = collection_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ------------------------------------------------------------------- list

    function listCard(uint256 id, uint256 amount, uint256 price) external whenNotPaused nonReentrant returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        if (amount == 0) revert InvalidAmount();
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = id;
        amounts[0] = amount;
        listingId = _create(ids, amounts, price, false);
    }

    function listBundle(uint256 setId, uint256 price) external whenNotPaused nonReentrant returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        uint256[] memory ids = collection.getSetCardIds(setId);
        uint256[] memory amounts = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) amounts[i] = 1;
        listingId = _create(ids, amounts, price, true);
    }

    function _create(uint256[] memory ids, uint256[] memory amounts, uint256 price, bool isBundle) internal returns (uint256 listingId) {
        listingId = nextListingId++;
        _listings[listingId] = Listing(msg.sender, ids, amounts, price, true, isBundle);
        emit Listed(listingId, msg.sender, ids, amounts, price, isBundle);
        // escrow (requires setApprovalForAll(marketplace, true))
        IERC1155(address(collection)).safeBatchTransferFrom(msg.sender, address(this), ids, amounts, "");
    }

    // -------------------------------------------------------------------- buy

    function buy(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage l = _listings[listingId];
        if (!l.active) revert NotActive();
        if (msg.sender == l.seller) revert SelfBuy();
        if (msg.value != l.price) revert WrongValue();

        // Effects
        l.active = false;
        uint256 fee = (l.price * feeBps) / 10_000;
        accruedFees += fee;
        pendingWithdrawals[l.seller] += l.price - fee;
        emit Sold(listingId, msg.sender, l.price);

        // Interactions
        IERC1155(address(collection)).safeBatchTransferFrom(address(this), msg.sender, l.ids, l.amounts, "");
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage l = _listings[listingId];
        if (!l.active) revert NotActive();
        if (msg.sender != l.seller) revert NotSeller();
        l.active = false;
        emit Cancelled(listingId);
        IERC1155(address(collection)).safeBatchTransferFrom(address(this), l.seller, l.ids, l.amounts, "");
    }

    // --------------------------------------------------------------- payments

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }

    function withdrawFees(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;
        emit Withdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
    }

    // ------------------------------------------------------------------ admin

    function setFee(uint256 bps) external onlyRole(ADMIN_ROLE) {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = bps;
        emit FeeUpdated(bps);
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ------------------------------------------------------------------ views

    function getListing(uint256 listingId) external view returns (Listing memory) { return _listings[listingId]; }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155Holder, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
