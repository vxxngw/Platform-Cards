# Smart contracts — Sàn thẻ sưu tập (Sepolia)

| Contract | Vai trò |
|---|---|
| `CardCollection.sol` | ERC-1155 + Supply + AccessControl + Pausable. Quản lý bộ thẻ, maxSupply, `redeemSet` đổi thẻ thưởng. |
| `PackSale.sol` | Bán gói (0.01 ETH, tối đa 10/tx), mở gói bằng Chainlink VRF v2.5. Tỉ lệ 60/28/10/2, slot 5 bảo đảm Rare+, hết supply thì rơi xuống độ hiếm thấp hơn. |
| `Marketplace.sol` | Escrow niêm yết lẻ / theo bộ, phí 2.5% (tối đa 10%), pull payments. |

## Cài đặt (Hardhat)

```bash
npm install --legacy-peer-deps
cp .env.example .env   # SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY, BASE_URI, VRF_SUBSCRIPTION_ID
npx hardhat test                 # 24 tests, VRF mocked by VRFCoordinatorV2_5Mock
npx hardhat coverage             # ~92% statements
REPORT_GAS=1 npx hardhat test    # gas table for the report
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/seed.js --network sepolia
```

## Thứ tự deploy

1. `CardCollection(baseUri)` — baseUri ví dụ `https://<app>/api/metadata/`
2. `PackSale(collection, vrfCoordinator, subscriptionId, keyHash)`
   - Sepolia coordinator: `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`
3. `Marketplace(collection)`
4. `collection.grantRole(MINTER_ROLE, packSale)`
5. Thêm `packSale` làm consumer của VRF subscription tại vrf.chain.link
6. `collection.createSet(...)` rồi `packSale.configurePack(setId, 0.01 ether, 1000, true)`
7. Verify trên Etherscan: `npx hardhat verify --network sepolia <addr> <args...>`

## Ghi chú

Bản web demo hiện tại chạy **mô phỏng off-chain** cùng logic với các contract này
(ví demo, VRF mô phỏng với commit–reveal có thể kiểm chứng trong trình duyệt).
Để chuyển sang on-chain thật, deploy các contract trên và thay lớp API bằng
wagmi/viem gọi trực tiếp contract.

## Kết quả đo thực tế

- **Mở pack hai pha.** Callback VRF chỉ lưu số ngẫu nhiên (`randomWord`, ~40k gas, `callbackGasLimit = 80_000`); người mua gọi
  `claimPacks(reqId)` để mint (10 pack ≈ 0,92M gas, tính vào giao dịch của người dùng, không giới hạn bởi VRF).
  Lý do: bản một pha (mint ngay trong callback) cần `callbackGasLimit` 1,5M, nhưng node Chainlink chỉ xử lý request khi
  subscription đủ LINK cho chi phí *tối đa* ở lane 500 gwei (≈ 170 LINK cho 1,5M gas, ≈ 60 LINK cho 500k). Với 15 LINK, request
  nằm `pending` mãi trên Sepolia. Callback nhẹ còn tránh được trường hợp callback revert làm mất pack.
- Request nặng nằm đầu hàng của một subscription có thể chặn các request sau; nếu lỡ gửi request lớn, tạo subscription mới
  (`scripts/new-sub.js`) thay vì chờ.
- `fulfillRandomWords`/`claimPacks` đọc cả set một lần (`getSetCardInfo`), rút trong memory rồi mint **một batch**.
- Thống kê 10.000 lượt rút (bỏ slot Rare+): lệch < 2% so với 60/28/10/2.

## Slither

`slither . --filter-paths "node_modules|src/test" --exclude-dependencies` (Slither 0.11, solc 0.8.24):

| Phát hiện | Đánh giá |
|---|---|
| `arbitrary-send-eth` (High) ×3 — `PackSale.withdraw`, `Marketplace.withdrawFees` | Chủ ý: chỉ `ADMIN_ROLE`, `nonReentrant`. Là điểm tập trung hoá, ghi trong báo cáo. |
| `uninitialized-local` (Medium) ×5 — bộ đếm `k`, `distinct`, `eligible` | Dương tính giả: biến cục bộ Solidity mặc định bằng 0. |
| `missing-zero-check` ×3 trên tham số `to` của hàm rút | Chỉ admin gọi; có thể thêm `require(to != address(0))` nếu muốn. |
| `reentrancy-benign` / `reentrancy-events` | State ghi sau `requestRandomWords` (coordinator tin cậy) và event sau `mintCards`; cả hai hàm đều `nonReentrant`. |
| `timestamp` ×2 | `cancelStuckRequest` dùng mốc 1 giờ, sai lệch giây của validator không ảnh hưởng. |
| `costly-loop`, `low-level-calls` | Thông tin; `createSet` ghi `nextCardId` mỗi vòng (≤ 12 thẻ), `call{value}` là cách gửi ETH khuyến nghị. |

Không có phát hiện nào cần sửa mã trước khi nộp.

## Chạy thử local với frontend on-chain

```bash
npx hardhat node                                                    # terminal 1
npx hardhat run scripts/deploy.js --network localhost               # deploy + mock VRF + addConsumer
npx hardhat run scripts/seed.js --network localhost
npx hardhat run scripts/local-fulfiller.js --network localhost      # terminal 2: đóng vai node Chainlink VRF
npm run export-abi                                                  # ghi ABI vào frontend/src/lib/chain/abi.ts
```

Điền địa chỉ + `VITE_CHAIN_MODE=onchain` theo `frontend/.env.example` (local: `VITE_CHAIN_ID=31337`,
`VITE_RPC_URL=http://127.0.0.1:8545`). Trên Sepolia: thêm PackSale làm consumer tại vrf.chain.link.

## Metadata

Trang Admin → Tạo bộ sẽ tải về `set-N-metadata.json`. Chạy
`node scripts/split-metadata.js set-N-metadata.json metadata`, pin thư mục lên Pinata rồi gọi
`collection.setBaseURI("ipfs://<CID>/")`. Frontend đọc tên thẻ, `priceRef` từ `uri(id)`.
