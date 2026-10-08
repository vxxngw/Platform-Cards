// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ChoTheoBo} from "../ChoTheoBo.sol";

/// @dev Chỉ dùng trong test: người mua là hợp đồng, khi nhận tiền hoàn lại thì cố mua bộ khác / rút tiền
///      (tấn công re-entrancy). ReentrancyGuard của ChoTheoBo phải chặn được.
contract KeTanCongMuaBo is ERC721Holder {
    ChoTheoBo public immutable cho;
    uint256 public boMucTieu;
    bool public biChanMuaLai;
    bool public biChanRutTien;
    bool public tanCongThanhCong;

    constructor(ChoTheoBo c) { cho = c; }

    function mua(uint256 maBo, uint256 maBoKhac) external payable {
        boMucTieu = maBoKhac;
        cho.muaBo{value: msg.value}(maBo);
    }

    receive() external payable {
        // tiền hoàn lại về đây: thử vào lại hợp đồng khi giao dịch gốc chưa kết thúc
        try cho.muaBo{value: address(this).balance}(boMucTieu) { tanCongThanhCong = true; } catch { biChanMuaLai = true; }
        try cho.rutTien() { tanCongThanhCong = true; } catch { biChanRutTien = true; }
    }
}
