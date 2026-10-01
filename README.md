# Platform Cards — The Royal Card Exchange (Sepolia)

Đồ án học thuật: phát hành thẻ theo bộ, bán pack ngẫu nhiên (Chainlink VRF), chợ thứ cấp. Thẻ là **bản số trên testnet** của thẻ Pokémon TCG, dữ liệu lấy từ [TCGdex](https://tcgdex.dev).

| Thư mục | Nội dung |
|---|---|
| `contracts/` | `CardCollection`, `PackSale`, `Marketplace` (xem [contracts/README.md](contracts/README.md)) |
| `frontend/` | Vite + React, giao diện **tiếng Anh**, phong cách High-Fantasy / Royal. Đọc và ghi trực tiếp lên 3 hợp đồng; ví qua **Privy** (đăng nhập email → ví nhúng, hoặc MetaMask / ví ngoài). Trang: Home, Gacha (mua pack xong mở ngay trong hộp thoại), Marketplace, Profile (Collection · Packs · Activities), Admin và `/admin/pack-builder` |
| `frontend/api/` | Hàm serverless của Vercel (Express): `/api/pin` (pin metadata lên Pinata, chỉ admin), `/api/price` (Renaiss Index, cache 24h — giao diện đang để “Sắp ra mắt”), `/api/eth` (giá ETH). Không có server riêng, không có cổng, không có database |

Biến môi trường: xem `frontend/.env.example` (phần `VITE_*` công khai trong trình duyệt; `PINATA_JWT`, `RENAISS_API_KEY`, `RENAISS_API_SECRET` chỉ ở phía server, không bao giờ đặt tên `VITE_*`) và `contracts/.env.example`.

Tên thương hiệu và khẩu hiệu nằm ở `frontend/src/lib/brand.ts`; màu, font (Cinzel, Spectral, tự host qua `@fontsource`) và các lớp trang trí ở `frontend/src/index.css` và `frontend/src/components/royal/`.

## Chạy và kiểm tra

```bash
cd frontend && npm ci --legacy-peer-deps
cp .env.example .env     # điền VITE_* (và PINATA_JWT… nếu muốn thử Pack Builder)
npm run dev              # app + /api trên cùng một cổng, không cần backend riêng
npm test                 # vitest + test của frontend/api
npx tsc --noEmit && npm run build
cd ../contracts && npm ci --legacy-peer-deps && npx hardhat test
```

CI chạy cả hai phần, xem `.github/workflows/ci.yml`.

## Go live trên Sepolia (giao dịch thật bằng ETH testnet)

Không dùng mainnet hay tiền thật: dự án chỉ chạy trên Sepolia (xem Tuyên bố miễn trừ). Frontend và `/api` cùng nằm trong một dự án Vercel.

1. **Privy:** trên dashboard.privy.io, mở app → **Login methods**: bật Email và External wallets; **Embedded wallets**: bật Ethereum; **Allowed origins** (Settings → Domains): thêm domain Vercel (vd. `https://<tên>.vercel.app`) và `http://localhost:5173`. Lấy **App ID** cho `VITE_PRIVY_APP_ID`. App secret không dùng ở đâu cả.
2. **Ví:** người chơi đăng nhập bằng email (Privy tạo ví nhúng) hoặc kết nối MetaMask. Ví admin (deployer, có `ADMIN_ROLE`) phải kết nối như ví ngoài (MetaMask đã import khoá deployer). Mỗi ví cần ETH Sepolia (menu ví có lối tắt tới faucet).
3. **Hợp đồng và VRF:** deploy theo [contracts/README.md](contracts/README.md). Subscription Chainlink phải còn LINK và `PackSale` phải là consumer (vrf.chain.link), nếu không pack mở mãi ở trạng thái `pending`.
4. **Vercel:** import repo, **Root Directory = `frontend`**. `frontend/vercel.json` đã đặt lệnh cài, build và thư mục output.
5. **Environment Variables** (Production và Preview): các `VITE_*` trong `frontend/.env.example` (gồm `VITE_PRIVY_APP_ID`), cùng `PINATA_JWT` (bắt buộc để phát hành set), `COLLECTION_ADDRESS` (để `/api/pin` kiểm tra `ADMIN_ROLE`), tuỳ chọn `CHAIN_RPC_URL`. Biến `VITE_*` chỉ có hiệu lực sau khi build lại.
6. **Phát hành set:** mở `/#/admin/pack-builder` bằng ví admin, chọn 11 thẻ + reward card, Phát hành (pin metadata → `createSet` → `setBaseURI` → `configurePack`). Nếu TCGdex lỗi: `contracts/scripts/seed-pokemon.js`.
7. **Thử trade thật:** ví B mua pack → mở pack (đợi VRF, vài phút) → niêm yết một thẻ ở Bộ sưu tập (có 1 giao dịch `setApprovalForAll`) → ví C mua ở `/#/market` → ví B rút tiền bán. Kiểm tra mỗi giao dịch trên Etherscan Sepolia.

**Giá tham chiếu Renaiss:** đang hiển thị “Sắp ra mắt”. Khi có API key: đặt `RENAISS_API_KEY`, `RENAISS_API_SECRET` trên Vercel và đổi `PRICE_REF_ENABLED` thành `true` trong `frontend/src/lib/features.ts`.

## Tuyên bố miễn trừ

Dự án **phi thương mại, chỉ chạy trên mạng thử nghiệm Sepolia**, không dùng tiền thật, không có thẻ vật lý và thẻ không có giá trị tài chính. Tên và hình ảnh thẻ Pokémon thuộc Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; dự án không liên kết hay được bảo trợ bởi các bên này. Ảnh trỏ trực tiếp về `assets.tcgdex.net`, không được sao chép hay lưu trên IPFS. Giá tham chiếu (nếu có) lấy từ Renaiss OS Index, chỉ để tham khảo. Trang demo sẽ được gỡ sau khi bảo vệ.
