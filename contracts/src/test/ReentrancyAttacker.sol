// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Marketplace} from "../Marketplace.sol";

/// @dev Test-only: tries to re-enter Marketplace.buy / withdraw from its callbacks.
contract ReentrancyAttacker is ERC1155Holder {
    Marketplace public immutable market;
    uint256 public targetListing;
    bool public attackOnReceive;
    bool public attackOnEth;
    bool public reentered;

    constructor(Marketplace m) { market = m; }

    function approveAll(address collection) external { IERC1155(collection).setApprovalForAll(address(market), true); }

    function list(uint256 id, uint256 amount, uint256 price) external returns (uint256) { return market.listCard(id, amount, price); }

    function arm(uint256 listingId, bool onReceive, bool onEth) external {
        targetListing = listingId; attackOnReceive = onReceive; attackOnEth = onEth;
    }

    function buy(uint256 listingId) external payable { market.buy{value: msg.value}(listingId); }
    function withdraw() external { market.withdraw(); }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory) public override returns (bytes4) {
        if (attackOnReceive) {
            attackOnReceive = false;
            try market.buy{value: 0}(targetListing) {} catch { reentered = false; return this.onERC1155BatchReceived.selector; }
            reentered = true;
        }
        return this.onERC1155BatchReceived.selector;
    }

    receive() external payable {
        if (attackOnEth) {
            attackOnEth = false;
            try market.withdraw() { reentered = true; } catch {}
        }
    }
}
