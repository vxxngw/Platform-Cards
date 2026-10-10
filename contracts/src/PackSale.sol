// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CardCollection} from "./CardCollection.sol";

/// @title PackSale — bán pack bằng ETH, mở pack bằng commit-reveal (không cần oracle, chạy được trên chain private)
/// @notice Mở pack gồm hai giao dịch:
///         1. openPacks(setId, qty, commitment) với commitment = keccak256(abi.encode(secret, buyer)); secret do trình duyệt sinh.
///         2. revealPacks(reqId, secret) từ block commitBlock + 2: seed = keccak256(secret, blockhash(commitBlock + 1), reqId).
///         Lúc commit, người mua chưa biết blockhash(commitBlock + 1), còn người đóng block không biết secret,
///         nên không bên nào đoán trước được thẻ. blockhash() chỉ đọc được 256 block gần nhất: quá hạn đó mà chưa reveal
///         thì expireRequest() hoàn pack về `unopened` (spec §6).
contract PackSale is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant CARDS_PER_PACK = 5;
    uint256 public constant MAX_PER_TX = 10;
    /// @notice Reveal is possible while blockhash(commitBlock + 1) is readable: up to block commitBlock + 1 + REVEAL_WINDOW.
    uint256 public constant REVEAL_WINDOW = 256;

    enum Status { None, Committed, Revealed, Expired }

    struct PackConfig { uint256 setId; uint256 price; uint256 remaining; bool onSale; }
    struct OpenRequest { address buyer; uint256 setId; uint32 count; uint64 commitBlock; bytes32 commitment; Status status; }

    CardCollection public immutable collection;

    mapping(uint256 => PackConfig) public packConfigs;                 // setId => config
    mapping(address => mapping(uint256 => uint256)) public unopened;   // user => setId => packs
    mapping(uint256 => OpenRequest) public requests;                   // reqId => request
    uint256 public requestCount;                                       // reqId starts at 1

    // Cumulative thresholds out of 10_000: Common 60%, Rare 28%, Epic 10%, Legendary 2%.
    uint16[4] public thresholds = [6000, 8800, 9800, 10000];

    event PackConfigured(uint256 indexed setId, uint256 price, uint256 supply, bool onSale);
    event PacksPurchased(address indexed buyer, uint256 indexed setId, uint256 qty, uint256 paid);
    event OpenRequested(uint256 indexed reqId, address indexed buyer, uint256 indexed setId, uint256 qty, bytes32 commitment);
    event PackOpened(uint256 indexed reqId, address indexed buyer, uint256[] cardIds, bytes32 seed);
    event RequestExpired(uint256 indexed reqId);
    event Withdrawn(address indexed to, uint256 amount);

    error NotOnSale();
    error BadQuantity();
    error WrongValue();
    error SoldOut();
    error NotEnoughPacks();
    error EmptyCommitment();
    error NotRevealable();
    error RevealTooEarly();
    error RevealWindowClosed();
    error WrongSecret();
    error NotExpired();
    error AllCardsExhausted();

    constructor(CardCollection collection_) {
        collection = collection_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ------------------------------------------------------------------ admin

    function configurePack(uint256 setId, uint256 price, uint256 supply, bool onSale) external onlyRole(ADMIN_ROLE) {
        packConfigs[setId] = PackConfig(setId, price, supply, onSale);
        emit PackConfigured(setId, price, supply, onSale);
    }

    function withdraw(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 amount = address(this).balance;
        emit Withdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ------------------------------------------------------------------- user

    function buyPacks(uint256 setId, uint256 qty) external payable whenNotPaused nonReentrant {
        PackConfig storage cfg = packConfigs[setId];
        if (!cfg.onSale) revert NotOnSale();
        if (qty == 0 || qty > MAX_PER_TX) revert BadQuantity();
        if (cfg.remaining < qty) revert SoldOut();
        if (msg.value != cfg.price * qty) revert WrongValue(); // no overpayment kept
        cfg.remaining -= qty;
        unopened[msg.sender][setId] += qty;
        emit PacksPurchased(msg.sender, setId, qty, msg.value);
    }

    /// @notice Bước 1 (commit): khoá `qty` pack vào một yêu cầu mở, kèm commitment = keccak256(abi.encode(secret, msg.sender)).
    function openPacks(uint256 setId, uint256 qty, bytes32 commitment) external whenNotPaused nonReentrant returns (uint256 reqId) {
        if (qty == 0 || qty > MAX_PER_TX) revert BadQuantity();
        if (commitment == bytes32(0)) revert EmptyCommitment();
        if (unopened[msg.sender][setId] < qty) revert NotEnoughPacks();
        unopened[msg.sender][setId] -= qty;
        reqId = ++requestCount;
        requests[reqId] = OpenRequest(msg.sender, setId, uint32(qty), uint64(block.number), commitment, Status.Committed);
        emit OpenRequested(reqId, msg.sender, setId, qty, commitment);
    }

    /// @notice Bước 2 (reveal): mint 5×qty thẻ. Ai gọi cũng được (cần đúng secret), thẻ luôn về ví người mua.
    function revealPacks(uint256 reqId, bytes32 secret) external nonReentrant whenNotPaused {
        OpenRequest storage r = requests[reqId];
        if (r.status != Status.Committed) revert NotRevealable();
        uint256 anchor = uint256(r.commitBlock) + 1;
        if (block.number <= anchor) revert RevealTooEarly();               // blockhash(anchor) does not exist yet
        if (block.number > anchor + REVEAL_WINDOW) revert RevealWindowClosed(); // blockhash(anchor) is no longer readable
        if (keccak256(abi.encode(secret, r.buyer)) != r.commitment) revert WrongSecret();
        r.status = Status.Revealed;
        bytes32 seed = keccak256(abi.encode(secret, blockhash(anchor), reqId));
        (uint256[] memory drawn, uint256[] memory ids, uint256[] memory amounts) = _draw(r.setId, r.count, uint256(seed));
        collection.mintCards(r.buyer, ids, amounts); // single batch mint of the aggregated amounts
        emit PackOpened(reqId, r.buyer, drawn, seed);
    }

    /// @notice Hoàn pack khi đã quá hạn reveal (spec §6). Ai gọi cũng được, pack luôn về ví người mua.
    /// @dev Người mua tính được kết quả ngay khi block commitBlock + 1 được đóng, nên có thể cố tình không reveal một lượt
    ///      xấu rồi đợi 256 block để lấy lại pack (xem README, mục Ngẫu nhiên khi mở pack).
    function expireRequest(uint256 reqId) external {
        OpenRequest storage r = requests[reqId];
        if (r.status != Status.Committed || block.number <= uint256(r.commitBlock) + 1 + REVEAL_WINDOW) revert NotExpired();
        r.status = Status.Expired;
        unopened[r.buyer][r.setId] += r.count;
        emit RequestExpired(reqId);
    }

    // ------------------------------------------------------------------- draw

    /// @dev Rút 5×count thẻ từ `word`: `drawn` theo thứ tự rút, `ids`/`amounts` gộp lại để mint một batch.
    ///      Slot 5 của mỗi pack rút từ bảng Rare+.
    function _draw(uint256 setId, uint256 count, uint256 word)
        internal view returns (uint256[] memory drawn, uint256[] memory ids, uint256[] memory amounts)
    {
        // One external read for the whole set, then everything is done in memory.
        (uint256[] memory setCards, uint8[] memory rarities, uint256[] memory remaining) = collection.getSetCardInfo(setId);
        uint256 n = setCards.length;
        uint256 total = count * CARDS_PER_PACK;
        drawn = new uint256[](total);
        uint256[] memory minted = new uint256[](n);

        for (uint256 i; i < total; ++i) {
            uint256 roll = uint256(keccak256(abi.encode(word, i))) % 10_000;
            if (i % CARDS_PER_PACK == CARDS_PER_PACK - 1) roll = 6000 + (roll % 4000); // Rare+ slot
            uint256 rarity = roll < thresholds[0] ? 0 : roll < thresholds[1] ? 1 : roll < thresholds[2] ? 2 : 3;
            uint256 pick = uint256(keccak256(abi.encode(word, i, "card")));
            uint256 idx = _pick(rarities, remaining, minted, rarity, pick);
            ++minted[idx];
            drawn[i] = setCards[idx];
        }

        uint256 distinct;
        for (uint256 j; j < n; ++j) if (minted[j] > 0) ++distinct;
        ids = new uint256[](distinct);
        amounts = new uint256[](distinct);
        uint256 k;
        for (uint256 j; j < n; ++j) {
            if (minted[j] == 0) continue;
            ids[k] = setCards[j];
            amounts[k++] = minted[j];
        }
    }

    /// @dev Chọn thẻ cùng độ hiếm còn supply; nếu cả nhóm đã hết thì rơi xuống độ hiếm thấp hơn kế tiếp.
    function _pick(uint8[] memory rarities, uint256[] memory remaining, uint256[] memory minted, uint256 rarity, uint256 pick)
        internal pure returns (uint256)
    {
        uint256 n = rarities.length;
        while (true) {
            uint256 eligible;
            for (uint256 j; j < n; ++j) if (rarities[j] == rarity && remaining[j] > minted[j]) ++eligible;
            if (eligible > 0) {
                uint256 target = pick % eligible;
                for (uint256 j; j < n; ++j) {
                    if (rarities[j] != rarity || remaining[j] <= minted[j]) continue;
                    if (target == 0) return j;
                    --target;
                }
            }
            if (rarity == 0) revert AllCardsExhausted();
            --rarity;
        }
        revert AllCardsExhausted(); // unreachable
    }
}
