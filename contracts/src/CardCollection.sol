// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title CardCollection — thẻ sưu tập phát hành theo bộ (ERC-1155)
/// @notice Mỗi cardId là một mẫu thẻ có nhiều bản; chỉ PackSale (MINTER_ROLE) được mint thẻ thường.
contract CardCollection is ERC1155Supply, AccessControl, Pausable {
    using Strings for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    enum Rarity { Common, Rare, Epic, Legendary }

    struct Card { uint256 setId; Rarity rarity; uint256 maxSupply; bool isReward; }
    struct CardSet { string name; uint256[] cardIds; uint256 rewardCardId; bool active; }

    mapping(uint256 => Card) public cards;     // cardId => Card
    mapping(uint256 => CardSet) internal _sets; // setId  => CardSet
    uint256 public nextCardId = 1;
    uint256 public nextSetId = 1;
    string private _baseUri; // ipfs://<CID>/

    event SetCreated(uint256 indexed setId, string name, uint256[] cardIds, uint256 rewardCardId);
    event SetRedeemed(address indexed user, uint256 indexed setId, uint256 rewardCardId);

    error InvalidSetSize();
    error LengthMismatch();
    error MaxSupplyExceeded(uint256 cardId);
    error UnknownSet(uint256 setId);
    error IncompleteSet(uint256 cardId);

    constructor(string memory baseUri_) ERC1155("") {
        _baseUri = baseUri_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Tạo set + các cardId liên tiếp + 1 reward card.
    function createSet(
        string calldata name,
        Rarity[] calldata rarities,
        uint256[] calldata maxSupplies,
        uint256 rewardMaxSupply
    ) external onlyRole(ADMIN_ROLE) returns (uint256 setId) {
        uint256 n = rarities.length;
        if (n < 8 || n > 12) revert InvalidSetSize();
        if (n != maxSupplies.length) revert LengthMismatch();

        setId = nextSetId++;
        CardSet storage s = _sets[setId];
        s.name = name;
        s.active = true;
        for (uint256 i; i < n; ++i) {
            uint256 id = nextCardId++;
            cards[id] = Card(setId, rarities[i], maxSupplies[i], false);
            s.cardIds.push(id);
        }
        uint256 rewardId = nextCardId++;
        cards[rewardId] = Card(setId, Rarity.Legendary, rewardMaxSupply, true);
        s.rewardCardId = rewardId;
        emit SetCreated(setId, name, s.cardIds, rewardId);
    }

    function setBaseURI(string calldata baseUri_) external onlyRole(ADMIN_ROLE) { _baseUri = baseUri_; }
    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ----------------------------------------------------------------- minter

    /// @notice Gọi từ PackSale khi mở pack. Kiểm tra maxSupply từng thẻ.
    function mintCards(address to, uint256[] calldata ids, uint256[] calldata amounts) external onlyRole(MINTER_ROLE) {
        for (uint256 i; i < ids.length; ++i) {
            Card storage c = cards[ids[i]];
            if (c.isReward || totalSupply(ids[i]) + amounts[i] > c.maxSupply) revert MaxSupplyExceeded(ids[i]);
        }
        _mintBatch(to, ids, amounts, "");
    }

    /// @notice Còn mint được `amount` bản thẻ `id` không (PackSale dùng để fallback độ hiếm).
    function canMint(uint256 id, uint256 amount) external view returns (bool) {
        return totalSupply(id) + amount <= cards[id].maxSupply;
    }

    // ------------------------------------------------------------------- user

    /// @notice Burn 1 bản mỗi thẻ trong set, nhận 1 reward card.
    function redeemSet(uint256 setId) external {
        CardSet storage s = _sets[setId];
        if (s.cardIds.length == 0) revert UnknownSet(setId);
        uint256 n = s.cardIds.length;
        uint256[] memory amounts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            if (balanceOf(msg.sender, s.cardIds[i]) == 0) revert IncompleteSet(s.cardIds[i]);
            amounts[i] = 1;
        }
        uint256 rewardId = s.rewardCardId;
        if (totalSupply(rewardId) + 1 > cards[rewardId].maxSupply) revert MaxSupplyExceeded(rewardId);
        _burnBatch(msg.sender, s.cardIds, amounts);
        _mint(msg.sender, rewardId, 1, "");
        emit SetRedeemed(msg.sender, setId, rewardId);
    }

    // ------------------------------------------------------------------ views

    function getSet(uint256 setId) external view returns (string memory name, uint256[] memory cardIds, uint256 rewardCardId, bool active) {
        CardSet storage s = _sets[setId];
        return (s.name, s.cardIds, s.rewardCardId, s.active);
    }

    /// @notice Một lần đọc cho PackSale: id, độ hiếm và supply còn lại của từng thẻ trong set.
    function getSetCardInfo(uint256 setId) external view returns (uint256[] memory ids, uint8[] memory rarities, uint256[] memory remaining) {
        ids = _sets[setId].cardIds;
        uint256 n = ids.length;
        rarities = new uint8[](n);
        remaining = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            Card storage c = cards[ids[i]];
            rarities[i] = uint8(c.rarity);
            uint256 sup = totalSupply(ids[i]);
            remaining[i] = c.maxSupply > sup ? c.maxSupply - sup : 0;
        }
    }

    function getSetCardIds(uint256 setId) external view returns (uint256[] memory) { return _sets[setId].cardIds; }

    /// @notice Mảng số dư từng thẻ trong set của `user`.
    function getSetProgress(address user, uint256 setId) external view returns (uint256[] memory balances) {
        uint256[] storage ids = _sets[setId].cardIds;
        balances = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) balances[i] = balanceOf(user, ids[i]);
    }

    function uri(uint256 id) public view override returns (string memory) {
        return string.concat(_baseUri, id.toString(), ".json");
    }

    // -------------------------------------------------------------- internals

    /// @dev Pause chặn mọi mint / burn / transfer.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override whenNotPaused
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
