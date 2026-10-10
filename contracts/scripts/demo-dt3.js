// Kịch bản demo đề ĐT-3 (4 phút), chạy trên chain local 2 node:
//   npm run demo:dt3            (= npx hardhat run scripts/demo-dt3.js --network localnet)
// Đúc 5 thẻ → tạo bộ 3 thẻ giá 0,5 ETH hạn 7 ngày → rao bán lẻ một thẻ trong bộ bị từ chối → ví B mua bộ, cả 3 thẻ sang B
// trong một giao dịch → huỷ bộ còn lại (2 thẻ) và rao bán lẻ bình thường.
// Mỗi lần chạy deploy một cặp TheBaiPokemon + ChoTheoBo mới; địa chỉ ghi vào deployments.dt3.<network>.json.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const { ethers, network } = hre;
const fmt = (wei) => `${ethers.formatEther(wei)} ETH`;
const ngan = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const buoc = (n, s) => console.log(`\n[${n}] ${s}`);
/** Các event `name` của hợp đồng `c` trong receipt `rc`. */
const suKien = (rc, c, name) => rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).filter((e) => e?.name === name);

async function main() {
  const [banPhatHanh, viA, viB] = await ethers.getSigners(); // dev #0 đúc thẻ và là chủ sàn, #1 người bán, #2 người mua
  console.log(`Mạng ${network.name} · ban phát hành ${ngan(banPhatHanh.address)} · ví A ${ngan(viA.address)} · ví B ${ngan(viB.address)}`);

  buoc(0, "Deploy TheBaiPokemon (ERC-721) và ChoTheoBo");
  const the = await (await ethers.getContractFactory("TheBaiPokemon")).deploy();
  await the.waitForDeployment();
  const cho = await (await ethers.getContractFactory("ChoTheoBo")).deploy(await the.getAddress());
  await cho.waitForDeployment();
  const diaChi = { network: network.name, TheBaiPokemon: await the.getAddress(), ChoTheoBo: await cho.getAddress() };
  fs.writeFileSync(path.join(__dirname, `../deployments.dt3.${network.name}.json`), JSON.stringify(diaChi, null, 2));
  console.log(`    TheBaiPokemon ${diaChi.TheBaiPokemon}\n    ChoTheoBo     ${diaChi.ChoTheoBo}`);

  buoc(1, "Đúc 5 thẻ cho ví A");
  const DS = [["Pikachu", 0, 1, 100], ["Charmander", 0, 1, 100], ["Squirtle", 1, 1, 30], ["Bulbasaur", 1, 1, 30], ["Mewtwo", 2, 1, 5]];
  const DO_HIEM = ["Thường", "Hiếm", "Sử thi"];
  const rcDuc = await (await the.ducNhieu(viA.address, DS.map(([tenNhanVat, doHiem, soSeri, tongPhatHanh]) =>
    ({ tenNhanVat, doHiem, soSeri, tongPhatHanh, uri: `ipfs://demo/${tenNhanVat}.json` })))).wait();
  const ids = suKien(rcDuc, the, "TheDaDuc").map((e) => e.args.tokenId);
  for (const id of ids) {
    const t = await the.thongTin(id);
    console.log(`    #${id} ${t.tenNhanVat} · ${DO_HIEM[Number(t.doHiem)]} · seri ${t.soSeri}/${t.tongPhatHanh}`);
  }

  buoc(2, "Ví A tạo bộ gồm 3 thẻ, giá 0,5 ETH, hạn 7 ngày");
  await (await the.connect(viA).setApprovalForAll(diaChi.ChoTheoBo, true)).wait();
  const homNay = (await ethers.provider.getBlock("latest")).timestamp;
  const bo1 = ids.slice(0, 3);
  const rcBo1 = await (await cho.connect(viA).taoBo(bo1, ethers.parseEther("0.5"), homNay + 7 * 24 * 3600)).wait();
  const maBo1 = suKien(rcBo1, cho, "BoDuocTao")[0].args.maBo;
  console.log(`    bộ #${maBo1}: thẻ ${bo1.map((i) => `#${i}`).join(", ")} → escrow trong ChoTheoBo, hạn ${new Date((homNay + 7 * 24 * 3600) * 1000).toLocaleString("vi-VN")}`);

  buoc(3, `Ví A thử rao bán lẻ thẻ #${bo1[0]} (đang nằm trong bộ)`);
  try {
    await cho.connect(viA).raoBanLe.staticCall(bo1[0], ethers.parseEther("0.1"));
    console.log("    !! không bị từ chối — sai so với yêu cầu");
  } catch (e) {
    // Qua geth, lỗi custom chỉ có dạng revert data thô (e.data): giải mã bằng ABI của ChoTheoBo
    const r = e.revert ?? (typeof e.data === "string" ? cho.interface.parseError(e.data) : null);
    console.log(`    bị từ chối: ${r ? `${r.name}(${r.args.join(", ")})` : e.shortMessage || e.message}`);
  }

  buoc(4, `Ví B mua bộ #${maBo1} với 0,5 ETH`);
  const tx = await cho.connect(viB).muaBo(maBo1, { value: ethers.parseEther("0.5") });
  const rc = await tx.wait();
  const chuyen = suKien(rc, the, "Transfer");
  console.log(`    một giao dịch ${tx.hash} (block ${rc.blockNumber}) chứa ${chuyen.length} lần chuyển thẻ:`);
  for (const e of chuyen) console.log(`      #${e.args.tokenId}: ${ngan(e.args.from)} → ${ngan(e.args.to)}`);
  for (const id of bo1) console.log(`    chủ thẻ #${id} bây giờ: ${(await the.ownerOf(id)) === viB.address ? "ví B" : await the.ownerOf(id)}`);

  buoc(5, "Ví A tạo bộ từ 2 thẻ còn lại, huỷ bộ đó rồi rao bán lẻ bình thường");
  const bo2 = ids.slice(3);
  const rcBo2 = await (await cho.connect(viA).taoBo(bo2, ethers.parseEther("0.3"), homNay + 7 * 24 * 3600)).wait();
  const maBo2 = suKien(rcBo2, cho, "BoDuocTao")[0].args.maBo;
  console.log(`    bộ #${maBo2}: thẻ ${bo2.map((i) => `#${i}`).join(", ")}`);
  await (await cho.connect(viA).huyBo(maBo2)).wait();
  console.log(`    huỷ bộ #${maBo2}: thẻ về lại ví A (chủ thẻ #${bo2[0]}: ${(await the.ownerOf(bo2[0])) === viA.address ? "ví A" : "?"})`);
  const rcLe = await (await cho.connect(viA).raoBanLe(bo2[0], ethers.parseEther("0.1"))).wait();
  const maRao = suKien(rcLe, cho, "DaRaoBanLe")[0].args.maRao;
  console.log(`    rao bán lẻ thẻ #${bo2[0]} giá 0,1 ETH: thành công, mã rao #${maRao}`);

  buoc(6, "Tiền");
  console.log(`    ví A được rút ${fmt(await cho.proceeds(viA.address))} (0,5 ETH trừ 2% phí), chủ sàn ${fmt(await cho.proceeds(banPhatHanh.address))}`);
}

main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
