const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

// Đề ĐT-3 "Sàn thẻ sưu tập bán theo bộ": TheBaiPokemon (ERC-721) + ChoTheoBo (bán theo bộ / rao bán lẻ).
const GIA_BO = ethers.parseEther("0.5");
const GIA_LE = ethers.parseEther("0.1");
const BAY_NGAY = 7 * 24 * 3600;

const yeuCau = (tenNhanVat, doHiem, soSeri, tongPhatHanh = 100) => ({ tenNhanVat, doHiem, soSeri, tongPhatHanh, uri: `ipfs://demo/${tenNhanVat}-${soSeri}.json` });

/** Ban phát hành (chu) đúc thẻ #1–#6 cho A và #7 cho C; A cho phép ChoTheoBo chuyển thẻ của mình. */
async function trienKhai() {
  const [chu, a, b, c] = await ethers.getSigners();
  const the = await (await ethers.getContractFactory("TheBaiPokemon")).deploy();
  const cho = await (await ethers.getContractFactory("ChoTheoBo")).deploy(await the.getAddress());
  await the.ducNhieu(a.address, [
    yeuCau("Pikachu", 0, 1), yeuCau("Pikachu", 0, 2), yeuCau("Charmander", 0, 1),
    yeuCau("Squirtle", 1, 1, 30), yeuCau("Bulbasaur", 1, 1, 30), yeuCau("Mewtwo", 2, 1, 5),
  ]);
  await the.duc(c.address, "Eevee", 0, 1, 100, "ipfs://demo/Eevee-1.json");
  await the.connect(a).setApprovalForAll(await cho.getAddress(), true);
  const hanBan = async () => (await time.latest()) + BAY_NGAY;
  return { the, cho, chu, a, b, c, hanBan };
}

describe("ChoTheoBo (ĐT-3)", () => {
  describe("Sáu test bắt buộc", () => {
    it("1. Tạo bộ quá 5 thẻ phải revert", async () => {
      const { cho, a, hanBan } = await trienKhai();
      await expect(cho.connect(a).taoBo([1, 2, 3, 4, 5, 6], GIA_BO, await hanBan()))
        .to.be.revertedWithCustomError(cho, "BoQuaNhieuThe").withArgs(6, 5);
    });

    it("2. Tạo bộ chứa thẻ không thuộc sở hữu người gọi phải revert", async () => {
      const { cho, a, hanBan } = await trienKhai();
      await expect(cho.connect(a).taoBo([1, 2, 7], GIA_BO, await hanBan())) // #7 là của C
        .to.be.revertedWithCustomError(cho, "TheKhongThuocNguoiGoi").withArgs(7);
    });

    it("3. Rao bán lẻ thẻ đang nằm trong bộ phải revert", async () => {
      const { cho, a, hanBan } = await trienKhai();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, await hanBan());
      await expect(cho.connect(a).raoBanLe(2, GIA_LE))
        .to.be.revertedWithCustomError(cho, "TheDangTrongBo").withArgs(2, 1);
    });

    it("4. Mua bộ: TẤT CẢ thẻ chuyển sang người mua trong một giao dịch", async () => {
      const { the, cho, a, b, hanBan } = await trienKhai();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, await hanBan());
      const tx = await cho.connect(b).muaBo(1, { value: GIA_BO });
      const rc = await tx.wait();
      // cả 3 lần chuyển thẻ nằm trong cùng một receipt
      const chuyen = rc.logs.map((l) => { try { return the.interface.parseLog(l); } catch { return null; } }).filter((e) => e?.name === "Transfer");
      expect(chuyen.map((e) => Number(e.args.tokenId))).to.deep.equal([1, 2, 3]);
      for (const e of chuyen) expect(e.args.to).to.equal(b.address);
      for (const id of [1, 2, 3]) expect(await the.ownerOf(id)).to.equal(b.address);
      await expect(tx).to.emit(cho, "BoDaBan").withArgs(1, b.address, GIA_BO, GIA_BO * 200n / 10_000n, 0);
      const bo = await cho.xemBo(1);
      expect(bo.trangThai).to.equal(2n); // DaBan
      expect(bo.nguoiMua).to.equal(b.address);
    });

    it("5. Mua bộ quá hạn rao bán phải revert (tua thời gian)", async () => {
      const { the, cho, a, b, hanBan } = await trienKhai();
      const han = await hanBan();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, han);
      await time.increaseTo(han + 1); // tua qua mốc hạn 7 ngày
      await expect(cho.connect(b).muaBo(1, { value: GIA_BO })).to.be.revertedWithCustomError(cho, "BoQuaHan");
      for (const id of [1, 2, 3]) expect(await the.ownerOf(id)).to.equal(await cho.getAddress()); // vẫn trong escrow
    });

    it("6. Huỷ bộ xong, các thẻ rao bán lẻ được bình thường", async () => {
      const { the, cho, a, hanBan } = await trienKhai();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, await hanBan());
      await expect(cho.connect(a).huyBo(1)).to.emit(cho, "BoDaHuy").withArgs(1, a.address);
      for (const id of [1, 2, 3]) {
        expect(await the.ownerOf(id)).to.equal(a.address); // thẻ đã về lại ví người tạo
        expect(await cho.boCuaThe(id)).to.equal(0n);       // và không còn bị khoá
      }
      await expect(cho.connect(a).raoBanLe(2, GIA_LE)).to.emit(cho, "DaRaoBanLe").withArgs(1, a.address, 2, GIA_LE);
      expect(await the.ownerOf(2)).to.equal(await cho.getAddress());
    });
  });

  describe("Bổ sung", () => {
    it("chỉ người tạo được huỷ bộ; bộ đã bán không huỷ được; người bán không tự mua bộ của mình", async () => {
      const { cho, a, b, hanBan } = await trienKhai();
      await cho.connect(a).taoBo([1, 2], GIA_BO, await hanBan());
      await expect(cho.connect(b).huyBo(1)).to.be.revertedWithCustomError(cho, "KhongPhaiNguoiTao");
      await expect(cho.connect(a).muaBo(1, { value: GIA_BO })).to.be.revertedWithCustomError(cho, "KhongTuMuaCuaMinh");
      await cho.connect(b).muaBo(1, { value: GIA_BO });
      await expect(cho.connect(a).huyBo(1)).to.be.revertedWithCustomError(cho, "BoKhongConHieuLuc");
    });

    it("bộ cần 2–5 thẻ không trùng; thẻ đang rao lẻ không vào bộ được", async () => {
      const { cho, a, hanBan } = await trienKhai();
      const han = await hanBan();
      await expect(cho.connect(a).taoBo([1], GIA_BO, han)).to.be.revertedWithCustomError(cho, "BoQuaItThe").withArgs(1, 2);
      await expect(cho.connect(a).taoBo([1, 1], GIA_BO, han)).to.be.revertedWithCustomError(cho, "TheDangTrongBo").withArgs(1, 1);
      await cho.connect(a).raoBanLe(4, GIA_LE);
      await expect(cho.connect(a).taoBo([3, 4], GIA_BO, han)).to.be.revertedWithCustomError(cho, "TheDangRaoBanLe").withArgs(4, 1);
    });

    it("tiền: sàn giữ 2%, người bán nhận phần còn lại qua rutTien, tiền gửi thừa hoàn ngay", async () => {
      const { cho, chu, a, b, hanBan } = await trienKhai();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, await hanBan());
      const thua = ethers.parseEther("0.2");
      await expect(cho.connect(b).muaBo(1, { value: GIA_BO + thua })).to.changeEtherBalance(b, -GIA_BO);
      const phi = GIA_BO * 200n / 10_000n;
      expect(await cho.proceeds(a.address)).to.equal(GIA_BO - phi);
      expect(await cho.proceeds(chu.address)).to.equal(phi);
      await expect(cho.connect(a).rutTien()).to.changeEtherBalance(a, GIA_BO - phi);
      await expect(cho.connect(a).rutTien()).to.be.revertedWithCustomError(cho, "KhongCoTienDeRut");
    });

    it("re-entrancy: người mua là hợp đồng, nhận tiền hoàn rồi cố mua bộ khác / rút tiền đều bị chặn", async () => {
      const { cho, a, hanBan } = await trienKhai();
      const han = await hanBan();
      await cho.connect(a).taoBo([1, 2, 3], GIA_BO, han);
      await cho.connect(a).taoBo([4, 5], GIA_BO, han);
      const ke = await (await ethers.getContractFactory("KeTanCongMuaBo")).deploy(await cho.getAddress());
      await ke.mua(1, 2, { value: GIA_BO * 2n }); // gửi thừa để tiền hoàn kích hoạt receive()
      expect(await ke.tanCongThanhCong()).to.equal(false);
      expect(await ke.biChanMuaLai()).to.equal(true);
      expect(await ke.biChanRutTien()).to.equal(true);
      expect((await cho.xemBo(2)).trangThai).to.equal(1n); // bộ 2 vẫn đang bán
    });

    it("TheBaiPokemon: chỉ chủ hợp đồng được đúc, soSeri ≤ tổng phát hành và không trùng", async () => {
      const { the, a } = await trienKhai();
      await expect(the.connect(a).duc(a.address, "Mew", 2, 1, 5, "")).to.be.revertedWithCustomError(the, "OwnableUnauthorizedAccount");
      await expect(the.duc(a.address, "Mew", 2, 6, 5, "")).to.be.revertedWithCustomError(the, "SoSeriVuotTongPhatHanh").withArgs(6, 5);
      await expect(the.duc(a.address, "Pikachu", 0, 1, 100, "")).to.be.revertedWithCustomError(the, "SoSeriDaTonTai").withArgs(1);
      const info = await the.thongTin(6);
      expect([info.tenNhanVat, info.doHiem, info.soSeri, info.tongPhatHanh]).to.deep.equal(["Mewtwo", 2n, 1n, 5n]);
    });
  });
});
