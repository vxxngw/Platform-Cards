// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ChoTheoBo — sàn bán thẻ theo bộ (đề ĐT-3)
/// @notice Người bán gom 2–5 thẻ của mình thành một "bộ" bán trọn gói với giá và hạn bán riêng.
///         Mua bộ là giao dịch nguyên tử: người mua nhận đủ mọi thẻ trong cùng một giao dịch, hoặc không nhận gì.
///         Thẻ trong bộ được giữ trong hợp đồng (escrow) và bị khoá: không rao bán lẻ, không vào bộ khác.
///         Tiền: sàn nhận 2%, người bán nhận phần còn lại qua `proceeds`; tiền gửi thừa được hoàn lại ngay.
contract ChoTheoBo is ERC721Holder, ReentrancyGuard {
    uint256 public constant PHI_SAN_BPS = 200;            // 2% = 200 / 10.000
    uint256 public constant TOI_DA_THE_MOI_BO = 5;        // tối đa 5 thẻ mỗi bộ
    uint256 public constant TOI_THIEU_THE_MOI_BO = 2;     // một "bộ" cần ít nhất 2 thẻ
    uint256 public constant HAN_BAN_TOI_DA = 365 days;

    enum TrangThai { KhongTonTai, DangBan, DaBan, DaHuy }

    struct Bo {
        address nguoiTao;
        uint256[] tokenIds;
        uint256 gia;          // giá trọn gói (wei)
        uint256 hanBan;       // mốc thời gian (Unix, giây): sau mốc này không mua được nữa
        TrangThai trangThai;
        address nguoiMua;
    }

    struct Rao {
        address nguoiBan;
        uint256 tokenId;
        uint256 gia;
        TrangThai trangThai;
        address nguoiMua;
    }

    IERC721 public immutable the;     // hợp đồng thẻ (TheBaiPokemon)
    address public immutable chuSan;  // nhận phí sàn

    uint256 public soBo;              // mã bộ bắt đầu từ 1
    uint256 public soRao;             // mã rao bán lẻ bắt đầu từ 1
    mapping(uint256 => Bo) private _bo;
    mapping(uint256 => Rao) private _rao;

    /// @notice tokenId => mã bộ đang chứa thẻ (0 nếu không nằm trong bộ nào)
    mapping(uint256 => uint256) public boCuaThe;
    /// @notice tokenId => mã rao bán lẻ đang hiệu lực (0 nếu không)
    mapping(uint256 => uint256) public raoCuaThe;
    /// @notice Số tiền mỗi địa chỉ có thể rút (rút bằng rutTien()).
    mapping(address => uint256) public proceeds;

    event BoDuocTao(uint256 indexed maBo, address indexed nguoiTao, uint256[] tokenIds, uint256 gia, uint256 hanBan);
    event BoDaBan(uint256 indexed maBo, address indexed nguoiMua, uint256 gia, uint256 phiSan, uint256 tienHoan);
    event BoDaHuy(uint256 indexed maBo, address indexed nguoiTao);
    event DaRaoBanLe(uint256 indexed maRao, address indexed nguoiBan, uint256 indexed tokenId, uint256 gia);
    event RaoBanLeDaBan(uint256 indexed maRao, address indexed nguoiMua, uint256 gia, uint256 phiSan, uint256 tienHoan);
    event RaoBanLeDaHuy(uint256 indexed maRao, address indexed nguoiBan);
    event DaRutTien(address indexed nguoiNhan, uint256 soTien);

    error BoQuaNhieuThe(uint256 soThe, uint256 toiDa);
    error BoQuaItThe(uint256 soThe, uint256 toiThieu);
    error TheKhongThuocNguoiGoi(uint256 tokenId);
    error TheDangTrongBo(uint256 tokenId, uint256 maBo);
    error TheDangRaoBanLe(uint256 tokenId, uint256 maRao);
    error GiaKhongHopLe();
    error HanBanKhongHopLe(uint256 hanBan);
    error BoKhongTonTai(uint256 maBo);
    error KhongPhaiNguoiTao();
    error BoKhongConHieuLuc();
    error BoQuaHan(uint256 hanBan, uint256 baoGio);
    error RaoKhongTonTai(uint256 maRao);
    error KhongPhaiNguoiBan();
    error RaoKhongConHieuLuc();
    error KhongDuTien(uint256 can, uint256 daGui);
    error KhongTuMuaCuaMinh();
    error HoanTienThatBai();
    error KhongCoTienDeRut();
    error RutTienThatBai();

    constructor(IERC721 the_) {
        the = the_;
        chuSan = msg.sender;
    }

    // ============================================================= BỘ THẺ

    /// @notice Tạo bộ gồm 2–5 thẻ của người gọi, bán trọn gói với giá `gia` (wei) đến mốc `hanBan` (Unix time).
    ///         Cần setApprovalForAll(ChoTheoBo, true) trước. Thẻ chuyển vào escrow và bị khoá cho đến khi bộ bán hoặc huỷ.
    function taoBo(uint256[] calldata tokenIds, uint256 gia, uint256 hanBan) external nonReentrant returns (uint256 maBo) {
        uint256 n = tokenIds.length;
        if (n > TOI_DA_THE_MOI_BO) revert BoQuaNhieuThe(n, TOI_DA_THE_MOI_BO);
        if (n < TOI_THIEU_THE_MOI_BO) revert BoQuaItThe(n, TOI_THIEU_THE_MOI_BO);
        if (gia == 0) revert GiaKhongHopLe();
        if (hanBan <= block.timestamp || hanBan > block.timestamp + HAN_BAN_TOI_DA) revert HanBanKhongHopLe(hanBan);

        maBo = ++soBo;
        // Kiểm tra và khoá toàn bộ thẻ trước khi chuyển (mã bộ ghi ngay nên thẻ trùng lặp trong mảng cũng bị chặn)
        for (uint256 i; i < n; ++i) {
            uint256 id = tokenIds[i];
            _kiemTraThe(id, msg.sender);
            boCuaThe[id] = maBo;
        }
        _bo[maBo] = Bo(msg.sender, tokenIds, gia, hanBan, TrangThai.DangBan, address(0));
        emit BoDuocTao(maBo, msg.sender, tokenIds, gia, hanBan);
        for (uint256 i; i < n; ++i) the.safeTransferFrom(msg.sender, address(this), tokenIds[i]);
    }

    /// @notice Huỷ bộ: chỉ người tạo bộ. Các thẻ được giải phóng và trả về ví người tạo.
    function huyBo(uint256 maBo) external nonReentrant {
        Bo storage b = _bo[maBo];
        if (b.trangThai == TrangThai.KhongTonTai) revert BoKhongTonTai(maBo);
        if (b.nguoiTao != msg.sender) revert KhongPhaiNguoiTao();
        if (b.trangThai != TrangThai.DangBan) revert BoKhongConHieuLuc();

        b.trangThai = TrangThai.DaHuy;
        uint256 n = b.tokenIds.length;
        for (uint256 i; i < n; ++i) boCuaThe[b.tokenIds[i]] = 0;
        emit BoDaHuy(maBo, msg.sender);
        for (uint256 i; i < n; ++i) the.safeTransferFrom(address(this), msg.sender, b.tokenIds[i]);
    }

    /// @notice Mua trọn bộ. Gửi `gia` hoặc hơn: phần thừa được hoàn lại cho người mua trong cùng giao dịch.
    function muaBo(uint256 maBo) external payable nonReentrant {
        Bo storage b = _bo[maBo];
        if (b.trangThai == TrangThai.KhongTonTai) revert BoKhongTonTai(maBo);
        if (b.trangThai != TrangThai.DangBan) revert BoKhongConHieuLuc();
        if (block.timestamp > b.hanBan) revert BoQuaHan(b.hanBan, block.timestamp);
        if (msg.value < b.gia) revert KhongDuTien(b.gia, msg.value);
        if (msg.sender == b.nguoiTao) revert KhongTuMuaCuaMinh();

        // effects
        b.trangThai = TrangThai.DaBan;
        b.nguoiMua = msg.sender;
        uint256 phi = (b.gia * PHI_SAN_BPS) / 10_000;
        proceeds[b.nguoiTao] += b.gia - phi;
        proceeds[chuSan] += phi;
        uint256 n = b.tokenIds.length;
        for (uint256 i; i < n; ++i) boCuaThe[b.tokenIds[i]] = 0;
        uint256 tienHoan = msg.value - b.gia;
        emit BoDaBan(maBo, msg.sender, b.gia, phi, tienHoan);

        // interactions: toàn bộ thẻ sang người mua, rồi hoàn tiền thừa
        for (uint256 i; i < n; ++i) the.safeTransferFrom(address(this), msg.sender, b.tokenIds[i]);
        _hoanTien(msg.sender, tienHoan);
    }

    /// @notice Xem một bộ.
    function xemBo(uint256 maBo) external view returns (Bo memory) {
        if (_bo[maBo].trangThai == TrangThai.KhongTonTai) revert BoKhongTonTai(maBo);
        return _bo[maBo];
    }

    // ============================================================ RAO BÁN LẺ

    /// @notice Rao bán lẻ một thẻ. Thẻ đang nằm trong bộ thì bị từ chối.
    function raoBanLe(uint256 tokenId, uint256 gia) external nonReentrant returns (uint256 maRao) {
        if (gia == 0) revert GiaKhongHopLe();
        _kiemTraThe(tokenId, msg.sender);
        maRao = ++soRao;
        raoCuaThe[tokenId] = maRao;
        _rao[maRao] = Rao(msg.sender, tokenId, gia, TrangThai.DangBan, address(0));
        emit DaRaoBanLe(maRao, msg.sender, tokenId, gia);
        the.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    function huyRaoBanLe(uint256 maRao) external nonReentrant {
        Rao storage r = _rao[maRao];
        if (r.trangThai == TrangThai.KhongTonTai) revert RaoKhongTonTai(maRao);
        if (r.nguoiBan != msg.sender) revert KhongPhaiNguoiBan();
        if (r.trangThai != TrangThai.DangBan) revert RaoKhongConHieuLuc();
        r.trangThai = TrangThai.DaHuy;
        raoCuaThe[r.tokenId] = 0;
        emit RaoBanLeDaHuy(maRao, msg.sender);
        the.safeTransferFrom(address(this), msg.sender, r.tokenId);
    }

    function muaLe(uint256 maRao) external payable nonReentrant {
        Rao storage r = _rao[maRao];
        if (r.trangThai == TrangThai.KhongTonTai) revert RaoKhongTonTai(maRao);
        if (r.trangThai != TrangThai.DangBan) revert RaoKhongConHieuLuc();
        if (msg.value < r.gia) revert KhongDuTien(r.gia, msg.value);
        if (msg.sender == r.nguoiBan) revert KhongTuMuaCuaMinh();

        r.trangThai = TrangThai.DaBan;
        r.nguoiMua = msg.sender;
        raoCuaThe[r.tokenId] = 0;
        uint256 phi = (r.gia * PHI_SAN_BPS) / 10_000;
        proceeds[r.nguoiBan] += r.gia - phi;
        proceeds[chuSan] += phi;
        uint256 tienHoan = msg.value - r.gia;
        emit RaoBanLeDaBan(maRao, msg.sender, r.gia, phi, tienHoan);

        the.safeTransferFrom(address(this), msg.sender, r.tokenId);
        _hoanTien(msg.sender, tienHoan);
    }

    function xemRao(uint256 maRao) external view returns (Rao memory) {
        if (_rao[maRao].trangThai == TrangThai.KhongTonTai) revert RaoKhongTonTai(maRao);
        return _rao[maRao];
    }

    // ================================================================ TIỀN

    /// @notice Rút toàn bộ số tiền đã bán được (người bán) hoặc phí sàn (chủ sàn).
    function rutTien() external nonReentrant {
        uint256 soTien = proceeds[msg.sender];
        if (soTien == 0) revert KhongCoTienDeRut();
        proceeds[msg.sender] = 0;
        emit DaRutTien(msg.sender, soTien);
        (bool ok, ) = payable(msg.sender).call{value: soTien}("");
        if (!ok) revert RutTienThatBai();
    }

    // ============================================================ NỘI BỘ

    /// @dev Thẻ phải thuộc người gọi và chưa nằm trong bộ / rao lẻ nào.
    function _kiemTraThe(uint256 tokenId, address nguoiGoi) internal view {
        uint256 maBo = boCuaThe[tokenId];
        if (maBo != 0) revert TheDangTrongBo(tokenId, maBo);
        uint256 maRao = raoCuaThe[tokenId];
        if (maRao != 0) revert TheDangRaoBanLe(tokenId, maRao);
        if (the.ownerOf(tokenId) != nguoiGoi) revert TheKhongThuocNguoiGoi(tokenId);
    }

    function _hoanTien(address den, uint256 soTien) internal {
        if (soTien == 0) return;
        (bool ok, ) = payable(den).call{value: soTien}("");
        if (!ok) revert HoanTienThatBai();
    }
}
