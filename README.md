# Sàn Thẻ Bộ — thẻ Pokémon TCG bản số trên Sepolia

Đồ án học thuật: phát hành thẻ theo bộ, bán pack ngẫu nhiên (Chainlink VRF), chợ thứ cấp. Thẻ là **bản số trên testnet** của thẻ Pokémon TCG, dữ liệu lấy từ [TCGdex](https://tcgdex.dev).

| Thư mục | Nội dung |
|---|---|
| `contracts/` | `CardCollection`, `PackSale`, `Marketplace` (xem [contracts/README.md](contracts/README.md)) |
| `backend/` | API: `/api/pin` (Pinata, chỉ admin), `/api/price` (Renaiss Index, cache 24h), `/api/metadata` |
| `frontend/` | Vite + React; `/admin/pack-builder` duyệt TCGdex và phát hành set |

Biến môi trường: `backend/.env.example` (`PINATA_JWT`, `RENAISS_API_KEY`, `RENAISS_API_SECRET` chỉ ở server), `contracts/.env.example`, `frontend/.env.example`.

## Chạy và triển khai

**Chạy local (off-chain demo):** `cd backend && npm i && npm run dev`, rồi `cd frontend && npm i --legacy-peer-deps && npm run dev` (đặt `PORT`, `BACKEND_PORT` như `.env.example`). Bỏ trống `VITE_CHAIN_MODE` để dùng demo mô phỏng.

**Kiểm tra:** `frontend`: `npx tsc --noEmit && npx vitest run && npx vite build`; `backend`: `npm test`; `contracts`: `npx hardhat test` (CI chạy cả ba, xem `.github/workflows/ci.yml`).

**Chạy on-chain trên Sepolia, theo thứ tự:**

1. Deploy hợp đồng: `cd contracts && npx hardhat run scripts/deploy.js --network sepolia` (ghi `deployments.sepolia.json`), thêm `PackSale` làm consumer của VRF subscription tại vrf.chain.link và nạp LINK.
2. Điền `frontend/.env` (`VITE_CHAIN_MODE=onchain`, ba địa chỉ hợp đồng, `VITE_DEPLOY_BLOCK`, `VITE_RPC_URL`, `VITE_ADMIN_ADDRESS`).
3. Điền `backend/.env`: `COLLECTION_ADDRESS` (để `/api/pin` kiểm tra `ADMIN_ROLE`), `PINATA_JWT` (không có thì metadata lưu trong database và phục vụ ở `/api/metadata/<id>.json`), tuỳ chọn `RENAISS_API_KEY`/`RENAISS_API_SECRET`.
4. Mở `/admin/pack-builder` bằng ví admin trên Sepolia: chọn 11 thẻ + reward card, bấm Phát hành (pin metadata → `createSet` → `setBaseURI` → `configurePack`). Nếu TCGdex lỗi: `npx hardhat run scripts/seed-pokemon.js --network sepolia`.
5. Hợp đồng đã deploy dùng `baseUri` mặc định `https://<app>/api/metadata/`; Pack Builder tự gọi `setBaseURI` ở mỗi lần phát hành khi base URI hiện tại khác thư mục vừa pin, nên không cần sửa tay.

## Go live trên Sepolia (giao dịch thật bằng ETH testnet)

Không dùng mainnet hay tiền thật: dự án chỉ chạy trên Sepolia (xem Tuyên bố miễn trừ).

1. **Ví:** MetaMask, đổi sang mạng Sepolia. Cần ví admin (deployer, có `ADMIN_ROLE`) và ít nhất 2 ví thử (người mua, người mua lại). Mỗi ví lấy ETH testnet ở faucet Sepolia.
2. **VRF:** subscription Chainlink phải còn LINK và `PackSale` phải là consumer (vrf.chain.link). Thiếu LINK thì pack mở mãi ở trạng thái `pending`.
3. **Backend** (Render / Railway / bất kỳ host Node nào), thư mục gốc `backend`, build `npm ci`, start `npm start`. Biến môi trường: `SURF_API_KEY`, `BACKEND_PORT` (= cổng host cấp, ví dụ giá trị `PORT`), `COLLECTION_ADDRESS`, `CHAIN_RPC_URL`, `PINATA_JWT` (không có thì metadata lưu trong database), tuỳ chọn `RENAISS_API_KEY`/`RENAISS_API_SECRET`.
4. **Frontend** (Vercel, Root Directory `frontend`): các biến `VITE_*` trong `frontend/.env.example` và `VITE_API_URL=https://<backend-host>` (không có dấu `/` ở cuối).
5. **Phát hành set:** mở `/admin/pack-builder` bằng ví admin, chọn 11 thẻ + reward card, Phát hành (pin metadata → `createSet` → `setBaseURI` → `configurePack`). Nếu chưa có Pinata thì backend phục vụ metadata ở `https://<backend-host>/api/metadata/`.
6. **Thử trade thật:** ví B mua pack → mở pack (đợi VRF, vài phút) → niêm yết một thẻ ở `/market` (có 1 giao dịch `setApprovalForAll`) → ví C mua thẻ → ví B rút tiền bán. Kiểm tra mỗi giao dịch trên Etherscan Sepolia.

## Tuyên bố miễn trừ

Dự án **phi thương mại, chỉ chạy trên mạng thử nghiệm Sepolia**, không dùng tiền thật, không có thẻ vật lý và thẻ không có giá trị tài chính. Tên và hình ảnh thẻ Pokémon thuộc Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; dự án không liên kết hay được bảo trợ bởi các bên này. Ảnh trỏ trực tiếp về `assets.tcgdex.net`, không được sao chép hay lưu trên IPFS. Giá tham chiếu (nếu có) lấy từ Renaiss OS Index, chỉ để tham khảo. Trang demo sẽ được gỡ sau khi bảo vệ.
