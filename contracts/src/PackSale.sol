// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {CardCollection} from "./CardCollection.sol";

/// @title PackSale — bán pack bằng ETH, mở pack bằng Chainlink VRF v2.5
contract PackSale is VRFConsumerBaseV2Plus, AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant CARDS_PER_PACK = 5;
    uint256 public constant MAX_PER_TX = 10;
    uint256 public constant STUCK_TIMEOUT = 1 hours;

    struct PackConfig { uint256 setId; uint256 price; uint256 remaining; bool onSale; }
    // Two-phase open: VRF callback only stores the word (cheap), the buyer then mints with claimPacks().
    struct OpenRequest { address buyer; uint256 setId; uint32 count; bool randomReady; bool claimed; uint64 requestedAt; }

    CardCollection public immutable collection;

    mapping(uint256 => PackConfig) public packConfigs;                 // setId => config
    mapping(address => mapping(uint256 => uint256)) public unopened;   // user => setId => packs
    mapping(uint256 => OpenRequest) public requests;                   // VRF requestId => request
    mapping(uint256 => uint256) public randomWord;                     // VRF requestId => random word

    // VRF config (Sepolia)
    uint256 public subscriptionId;
    bytes32 public keyHash;
    // The callback only stores one word (~40k gas). Chainlink nodes skip a request unless the subscription can cover its
    // *maximum* cost at the lane's max gas price, so a heavy callback (minting ≈ 0.9M gas for 10 packs) needs 100+ LINK in the sub.
    uint32 public callbackGasLimit = 80_000;
    uint16 public requestConfirmations = 3;

    // Cumulative thresholds out of 10_000: Common 60%, Rare 28%, Epic 10%, Legendary 2%.
    uint16[4] public thresholds = [6000, 8800, 9800, 10000];

    event PackConfigured(uint256 indexed setId, uint256 price, uint256 supply, bool onSale);
    event PacksPurchased(address indexed buyer, uint256 indexed setId, uint256 qty, uint256 paid);
    event OpenRequested(uint256 indexed reqId, address indexed buyer, uint256 indexed setId, uint256 qty);
    event RandomnessReady(uint256 indexed reqId, address indexed buyer);
    event PackOpened(uint256 indexed reqId, address indexed buyer, uint256[] cardIds);
    event RequestCancelled(uint256 indexed reqId);
    event Withdrawn(address indexed to, uint256 amount);

    error NotOnSale();
    error BadQuantity();
    error WrongValue();
    error SoldOut();
    error NotEnoughPacks();
    error NotStuck();
    error NotClaimable();
    error AllCardsExhausted();

    constructor(address coordinator, CardCollection collection_, uint256 subId, bytes32 keyHash_)
        VRFConsumerBaseV2Plus(coordinator)
    {
        collection = collection_;
        subscriptionId = subId;
        keyHash = keyHash_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ------------------------------------------------------------------ admin

    function configurePack(uint256 setId, uint256 price, uint256 supply, bool onSale) external onlyRole(ADMIN_ROLE) {
        packConfigs[setId] = PackConfig(setId, price, supply, onSale);
        emit PackConfigured(setId, price, supply, onSale);
    }

    function setVrfConfig(uint256 subId, bytes32 keyHash_, uint32 gasLimit, uint16 confirmations) external onlyRole(ADMIN_ROLE) {
        subscriptionId = subId;
        keyHash = keyHash_;
        callbackGasLimit = gasLimit;
        requestConfirmations = confirmations;
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

    function openPacks(uint256 setId, uint256 qty) external whenNotPaused nonReentrant returns (uint256 reqId) {
        if (qty == 0 || qty > MAX_PER_TX) revert BadQuantity();
        if (unopened[msg.sender][setId] < qty) revert NotEnoughPacks();
        unopened[msg.sender][setId] -= qty;

        reqId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );
        requests[reqId] = OpenRequest(msg.sender, setId, uint32(qty), false, false, uint64(block.timestamp));
        emit OpenRequested(reqId, msg.sender, setId, qty);
    }

    /// @notice Hoàn pack nếu VRF không phản hồi sau 1 giờ.
    function cancelStuckRequest(uint256 reqId) external {
        OpenRequest storage r = requests[reqId];
        if (r.buyer == address(0) || r.randomReady || r.claimed || block.timestamp < r.requestedAt + STUCK_TIMEOUT) revert NotStuck();
        r.claimed = true; // closes the request: a late VRF answer is ignored
        unopened[r.buyer][r.setId] += r.count;
        emit RequestCancelled(reqId);
    }

    // -------------------------------------------------------------------- VRF

    function fulfillRandomWords(uint256 reqId, uint256[] calldata words) internal override {
        OpenRequest storage r = requests[reqId];
        if (r.buyer == address(0) || r.randomReady || r.claimed) return;
        r.randomReady = true;
        randomWord[reqId] = words[0];
        emit RandomnessReady(reqId, r.buyer);
    }

    /// @notice Bước 2 của mở pack: mint 5×qty thẻ từ số ngẫu nhiên VRF đã lưu. Ai gọi cũng được, thẻ luôn về ví người mua.
    function claimPacks(uint256 reqId) external nonReentrant whenNotPaused {
        OpenRequest storage r = requests[reqId];
        if (r.buyer == address(0) || !r.randomReady || r.claimed) revert NotClaimable();
        r.claimed = true;
        uint256 word = randomWord[reqId];

        // One external read for the whole set, then everything is done in memory (keeps callback gas low).
        (uint256[] memory setCards, uint8[] memory rarities, uint256[] memory remaining) = collection.getSetCardInfo(r.setId);
        uint256 n = setCards.length;
        uint256 total = uint256(r.count) * CARDS_PER_PACK;
        uint256[] memory drawn = new uint256[](total);
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

        // single batch mint of the aggregated amounts
        uint256 distinct;
        for (uint256 j; j < n; ++j) if (minted[j] > 0) ++distinct;
        uint256[] memory ids = new uint256[](distinct);
        uint256[] memory amounts = new uint256[](distinct);
        uint256 k;
        for (uint256 j; j < n; ++j) {
            if (minted[j] == 0) continue;
            ids[k] = setCards[j];
            amounts[k++] = minted[j];
        }
        collection.mintCards(r.buyer, ids, amounts);
        emit PackOpened(reqId, r.buyer, drawn);
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

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
