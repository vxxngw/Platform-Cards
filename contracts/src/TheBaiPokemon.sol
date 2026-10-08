// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TheBaiPokemon — thẻ sưu tập Pokémon dạng NFT (ERC-721) cho đề ĐT-3 "Sàn thẻ sưu tập bán theo bộ"
/// @notice Mỗi thẻ là một token riêng, mang đúng ba trường dữ liệu của đề:
///         tenNhanVat (string), doHiem (Thường / Hiếm / Sử thi) và soSeri (uint256, 1 ≤ soSeri ≤ tổng phát hành).
///         Hình ảnh và dữ liệu hiển thị (ví dụ ảnh từ TCGdex) nằm trong tokenURI do người đúc cung cấp.
contract TheBaiPokemon is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    /// @dev Thường / Hiếm / Sử thi
    enum DoHiem { Thuong, Hiem, SuThi }

    struct ThongTinThe {
        string tenNhanVat;     // tên nhân vật (tên thẻ Pokémon)
        DoHiem doHiem;         // độ hiếm
        uint256 soSeri;        // số seri của bản này: 1 ≤ soSeri ≤ tongPhatHanh
        uint256 tongPhatHanh;  // tổng phát hành của loại thẻ (cùng tenNhanVat và doHiem)
    }

    struct YeuCauDuc {
        string tenNhanVat;
        DoHiem doHiem;
        uint256 soSeri;
        uint256 tongPhatHanh;
        string uri;
    }

    uint256 public constant TEN_TOI_DA = 64;
    uint256 public constant TONG_PHAT_HANH_TOI_DA = 1_000_000;
    uint256 public constant DUC_TOI_DA_MOI_LAN = 20;

    /// @notice Số thẻ đã đúc; cũng là tokenId của thẻ đúc gần nhất (tokenId bắt đầu từ 1).
    uint256 public soTheDaDuc;

    mapping(uint256 => ThongTinThe) private _thongTin;
    /// @notice Tổng phát hành đã đăng ký cho từng loại thẻ (khoá = maLoai(tenNhanVat, doHiem)).
    mapping(bytes32 => uint256) public tongPhatHanhCuaLoai;
    /// @notice Số bản đã đúc của từng loại thẻ.
    mapping(bytes32 => uint256) public soBanDaDuc;
    mapping(bytes32 => mapping(uint256 => bool)) private _soSeriDaDung;

    event TheDaDuc(uint256 indexed tokenId, address indexed to, string tenNhanVat, DoHiem doHiem, uint256 soSeri, uint256 tongPhatHanh);

    error TenKhongHopLe();
    error TongPhatHanhKhongHopLe(uint256 tongPhatHanh);
    error SoSeriVuotTongPhatHanh(uint256 soSeri, uint256 tongPhatHanh);
    error TongPhatHanhKhongKhop(uint256 daDangKy, uint256 nhapVao);
    error SoSeriDaTonTai(uint256 soSeri);
    error DucQuaNhieu(uint256 soLuong);

    constructor() ERC721("The Bai Pokemon", "PKC") Ownable(msg.sender) {}

    // ------------------------------------------------------------------ đúc thẻ

    /// @notice Đúc một thẻ. Chỉ chủ hợp đồng (ban phát hành) được đúc.
    function duc(address to, string calldata tenNhanVat, DoHiem doHiem, uint256 soSeri, uint256 tongPhatHanh, string calldata uri)
        external onlyOwner returns (uint256)
    {
        return _duc(to, tenNhanVat, doHiem, soSeri, tongPhatHanh, uri);
    }

    /// @notice Đúc nhiều thẻ cho một ví trong một giao dịch (tối đa DUC_TOI_DA_MOI_LAN).
    function ducNhieu(address to, YeuCauDuc[] calldata ds) external onlyOwner returns (uint256[] memory ids) {
        if (ds.length == 0 || ds.length > DUC_TOI_DA_MOI_LAN) revert DucQuaNhieu(ds.length);
        ids = new uint256[](ds.length);
        for (uint256 i; i < ds.length; ++i) {
            YeuCauDuc calldata d = ds[i];
            ids[i] = _duc(to, d.tenNhanVat, d.doHiem, d.soSeri, d.tongPhatHanh, d.uri);
        }
    }

    function _duc(address to, string calldata tenNhanVat, DoHiem doHiem, uint256 soSeri, uint256 tongPhatHanh, string calldata uri)
        internal returns (uint256 id)
    {
        uint256 n = bytes(tenNhanVat).length;
        if (n == 0 || n > TEN_TOI_DA) revert TenKhongHopLe();
        if (tongPhatHanh == 0 || tongPhatHanh > TONG_PHAT_HANH_TOI_DA) revert TongPhatHanhKhongHopLe(tongPhatHanh);
        // ràng buộc của đề: soSeri phải nhỏ hơn hoặc bằng tổng phát hành
        if (soSeri == 0 || soSeri > tongPhatHanh) revert SoSeriVuotTongPhatHanh(soSeri, tongPhatHanh);

        bytes32 loai = maLoai(tenNhanVat, doHiem);
        uint256 daDangKy = tongPhatHanhCuaLoai[loai];
        if (daDangKy == 0) tongPhatHanhCuaLoai[loai] = tongPhatHanh;
        else if (daDangKy != tongPhatHanh) revert TongPhatHanhKhongKhop(daDangKy, tongPhatHanh);
        if (_soSeriDaDung[loai][soSeri]) revert SoSeriDaTonTai(soSeri);

        _soSeriDaDung[loai][soSeri] = true;
        ++soBanDaDuc[loai];
        id = ++soTheDaDuc;
        _thongTin[id] = ThongTinThe(tenNhanVat, doHiem, soSeri, tongPhatHanh);
        _safeMint(to, id);
        _setTokenURI(id, uri);
        emit TheDaDuc(id, to, tenNhanVat, doHiem, soSeri, tongPhatHanh);
    }

    // --------------------------------------------------------------------- xem

    function maLoai(string memory tenNhanVat, DoHiem doHiem) public pure returns (bytes32) {
        return keccak256(abi.encode(tenNhanVat, doHiem));
    }

    /// @notice Ba trường dữ liệu riêng của thẻ (kèm tổng phát hành của loại thẻ).
    function thongTin(uint256 tokenId) external view returns (ThongTinThe memory) {
        _requireOwned(tokenId);
        return _thongTin[tokenId];
    }

    /// @notice Danh sách tokenId mà một ví đang giữ.
    function theCuaChu(address chu) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(chu);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = tokenOfOwnerByIndex(chu, i);
    }

    // ------------------------------------------------- khai báo kế thừa (OpenZeppelin v5)

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
