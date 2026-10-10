# Smart contracts — Sàn thẻ sưu tập (mạng local 2 node)

Hợp đồng chạy trên chain private trong `localnet/`: geth Clique, chainId 105701. Node 1 là validator, node 2 là RPC node
(xem [README gốc](../README.md#mạng-local-một-chain-hai-node)). Pack mở bằng commit-reveal, không cần oracle
(xem [Ngẫu nhiên khi mở pack](../README.md#ngẫu-nhiên-khi-mở-pack-commit-reveal)).

| Contract | Vai trò |
|---|---|
| `CardCollection.sol` | ERC-1155 + Supply + AccessControl + Pausable. Quản lý bộ thẻ, maxSupply, `redeemSet` đổi thẻ thưởng. |
| `PackSale.sol` | Bán gói (0.01 ETH, tối đa 10/tx), mở gói bằng commit-reveal: `openPacks(setId, qty, commitment)` → `revealPacks(reqId, secret)` trong 256 block, quá hạn thì `expireRequest` hoàn pack. Tỉ lệ 60/28/10/2, slot 5 bảo đảm Rare+, hết supply thì rơi xuống độ hiếm thấp hơn. |
| `Marketplace.sol` | Escrow niêm yết lẻ / theo bộ, phí 2.5% (tối đa 10%), pull payments. |

## Cài đặt (Hardhat)

```bash
npm ci --legacy-peer-deps
npx hardhat test                 # 42 tests (31 CARDRA + 11 ĐT-3)
npx hardhat coverage             # ~92% statements
REPORT_GAS=1 npx hardhat test    # gas table for the report
npm run deploy:local             # cần 2 node đang chạy, xem mục "Chạy trên mạng local 2 node"
npm run seed:local               # set demo cũ (v1)
npm run seed-pokemon:local       # dự phòng v2: set Pokémon 151 khi TCGdex lỗi
npm run smoke:local              # mua 1 pack, commit, chờ block, reveal, in 5 thẻ và seed
CHECK=1 node scripts/seed-pokemon.js   # đối chiếu snapshot với TCGdex (cần mạng)
```

## Thứ tự deploy

`scripts/deploy.js` làm tự động các bước sau:

1. `CardCollection(baseUri)` — baseUri ví dụ `https://<app>/api/metadata/`
2. `PackSale(collection)`
3. `Marketplace(collection)`
4. `collection.grantRole(MINTER_ROLE, packSale)`
5. Ghi `deployments.<network>.json` và `../frontend/.env.local`

Sau đó: `collection.createSet(...)` rồi `packSale.configurePack(setId, 0.01 ether, 1000, true)` (`seed:local` hoặc Pack Builder).

## Ghi chú

Frontend (`../frontend`) đọc và ghi trực tiếp lên 3 hợp đồng này bằng viem; không có lớp mô phỏng off-chain.
Địa chỉ hợp đồng đặt trong biến `VITE_*` (xem `../frontend/.env.example`).

## Kết quả đo thực tế

- **Mở pack hai giao dịch.** `openPacks` (commit) rất nhẹ; `revealPacks` rút và mint 10 pack ≈ 0,98M gas trong giao dịch của người
  dùng. Trên mạng local 2 node, reveal được sớm nhất 2 block sau commit (≈ 4 giây với block 2 giây).
- Trước đây (Sepolia) pack mở bằng Chainlink VRF v2.5 hai pha; bản đó còn trong lịch sử git.
- `revealPacks` đọc cả set một lần (`getSetCardInfo`), rút trong memory rồi mint **một batch**.
- Thống kê 10.000 lượt rút (bỏ slot Rare+): lệch < 2% so với 60/28/10/2.

## Slither

`slither . --filter-paths "node_modules|src/test" --exclude-dependencies` (Slither 0.11, solc 0.8.24):

| Phát hiện | Đánh giá |
|---|---|
| `arbitrary-send-eth` (High) ×3 — `PackSale.withdraw`, `Marketplace.withdrawFees` | Chủ ý: chỉ `ADMIN_ROLE`, `nonReentrant`. Là điểm tập trung hoá, ghi trong báo cáo. |
| `uninitialized-local` (Medium) ×5 — bộ đếm `k`, `distinct`, `eligible` | Dương tính giả: biến cục bộ Solidity mặc định bằng 0. |
| `missing-zero-check` ×3 trên tham số `to` của hàm rút | Chỉ admin gọi; có thể thêm `require(to != address(0))` nếu muốn. |
| `reentrancy-events` | Event `PackOpened` phát sau `mintCards` (hợp đồng CardCollection của chính dự án); hàm có `nonReentrant` và đã chuyển trạng thái sang `Revealed` trước khi gọi ra ngoài. |
| `weak-prng` (nếu có) | Có chủ ý: seed lấy `blockhash` kết hợp với secret đã commit trước, xem README gốc mục Ngẫu nhiên khi mở pack. |
| `costly-loop`, `low-level-calls` | Thông tin; `createSet` ghi `nextCardId` mỗi vòng (≤ 12 thẻ), `call{value}` là cách gửi ETH khuyến nghị. |

Bảng trên lập cho bản VRF trước đây; sau khi chuyển sang commit-reveal cần chạy lại Slither để cập nhật.

## Chạy trên mạng local 2 node (geth Clique)

```bash
npm run chain:setup        # một lần (chain:reset để tạo lại từ đầu)
npm run chain:node1        # terminal 1: validator, ký block mỗi 2 giây
npm run chain:node2        # terminal 2: RPC node http://127.0.0.1:8546
npm run chain:status       # kiểm tra 2 node cùng chain và đồng bộ
npm run deploy:local       # deploy → deployments.localnet.json, ../frontend/.env.local
npm run seed:local
npm run smoke:local        # thử mở 1 pack bằng commit-reveal
npm run fund -- <địa chỉ>  # faucet: 100 ETH từ tài khoản dev #9
npm run export-abi         # sau khi sửa hợp đồng: ghi ABI vào frontend/src/lib/chain/abi.ts
```

Mạng `localnet` trong `hardhat.config.js` gửi giao dịch qua node 2, ký bằng các tài khoản dev của mnemonic Hardhat
(đổi bằng `LOCALNET_RPC_URL`, `LOCALNET_PRIVATE_KEY`). Vẫn chạy được với `npx hardhat node` + `--network localhost`.

## Đề ĐT-3: sàn thẻ bán theo bộ (`TheBaiPokemon` + `ChoTheoBo`)

| Contract | Vai trò |
|---|---|
| `TheBaiPokemon.sol` | ERC-721, mỗi thẻ mang `tenNhanVat`, `doHiem` (Thường / Hiếm / Sử thi), `soSeri` ≤ `tongPhatHanh`. Chỉ chủ hợp đồng đúc (`duc`, `ducNhieu`). |
| `ChoTheoBo.sol` | Bộ 2–5 thẻ bán trọn gói có hạn (`taoBo` / `muaBo` / `huyBo`), rao bán lẻ (`raoBanLe` / `muaLe` / `huyRaoBanLe`). Thẻ trong bộ nằm escrow và bị khoá; phí sàn 2%, tiền bán rút bằng `rutTien`, tiền gửi thừa hoàn ngay; `nonReentrant`. |

Sáu test bắt buộc nằm trong `test/ChoTheoBo.test.js` (mục "Sáu test bắt buộc", đánh số 1–6), kèm 5 test bổ sung: quyền huỷ / tự mua, số thẻ 2–5, chia tiền và hoàn tiền thừa, re-entrancy bằng `src/test/KeTanCongMuaBo.sol`, ràng buộc dữ liệu của `TheBaiPokemon`.

```bash
npx hardhat test test/ChoTheoBo.test.js   # 11 test; test 5 tua thời gian bằng time.increaseTo (chỉ làm được trên mạng Hardhat)
npm run demo:dt3                          # kịch bản bảo vệ trên chain local 2 node (cần node 1 và node 2 đang chạy)
```

`demo:dt3` (`scripts/demo-dt3.js`) mỗi lần chạy deploy một cặp hợp đồng mới (địa chỉ ghi vào `deployments.dt3.localnet.json`) rồi chạy đúng kịch bản: đúc 5 thẻ cho ví A (dev #1) → tạo bộ 3 thẻ giá 0,5 ETH hạn 7 ngày → rao bán lẻ một thẻ trong bộ bị từ chối (`TheDangTrongBo`) → ví B (dev #2) mua bộ, in ra một giao dịch chứa 3 lần chuyển thẻ → tạo bộ từ 2 thẻ còn lại, huỷ bộ rồi rao bán lẻ thành công → in tiền ví A được rút (0,49 ETH) và phí sàn (0,01 ETH).

## Metadata

Trang Admin → Tạo bộ sẽ tải về `set-N-metadata.json`. Chạy
`node scripts/split-metadata.js set-N-metadata.json metadata`, pin thư mục lên Pinata rồi gọi
`collection.setBaseURI("ipfs://<CID>/")`. Frontend đọc tên thẻ, `priceRef` từ `uri(id)`.
