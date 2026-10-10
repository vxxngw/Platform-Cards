# CARDRA — The Royal Card Exchange (mạng local 2 node)

Đồ án học thuật: phát hành thẻ theo bộ, bán pack ngẫu nhiên (commit-reveal on-chain), chợ thứ cấp. Thẻ là **bản số** của thẻ Pokémon TCG, dữ liệu lấy từ [TCGdex](https://tcgdex.dev).
Dự án chạy trên **một blockchain Ethereum private** (geth, đồng thuận Clique PoA, chainId `105701`) do **hai node** vận hành trên máy bạn; không dùng Sepolia, không dùng Chainlink, ví là **MetaMask** kết nối trực tiếp.

| Thư mục | Nội dung |
|---|---|
| `contracts/` | `CardCollection`, `PackSale`, `Marketplace` (xem [contracts/README.md](contracts/README.md)) |
| `contracts/localnet/` | Dựng và chạy mạng local: `setup.js` (genesis, khoá, `geth init`), `node.js` (chạy node 1 / node 2), `status.js` (kiểm tra 2 node) |
| `frontend/` | Vite + React, giao diện **tiếng Anh**, phong cách High-Fantasy / Royal. Đọc và ghi trực tiếp lên 3 hợp đồng qua MetaMask (EIP-6963). Trang: Home, Gacha (mua pack xong mở ngay trong hộp thoại), Marketplace, Profile (Collection · Packs · Activities), Admin và `/admin/pack-builder` |
| `frontend/api/` | Express app chạy chung cổng với `npm run dev`: `/api/pin` (pin metadata lên Pinata, chỉ admin), `/api/price` (Renaiss Index, cache 24h — giao diện đang để “Sắp ra mắt”), `/api/eth` (giá ETH). Không có server riêng, không có database |

Biến môi trường: `npm run deploy:local` tự ghi địa chỉ hợp đồng và RPC vào `frontend/.env.local`. Các biến còn lại (`PINATA_JWT`…) xem `frontend/.env.example`: phần `VITE_*` công khai trong trình duyệt; `PINATA_JWT`, `RENAISS_API_KEY`, `RENAISS_API_SECRET` chỉ ở phía server, không bao giờ đặt tên `VITE_*`.

Tên thương hiệu và khẩu hiệu nằm ở `frontend/src/lib/brand.ts`; logo đặt tại `frontend/src/assets/logoMain.png` (tự dùng cho header, footer, mặt sau thẻ và favicon; chưa có file thì dùng huy hiệu mặc định); màu, font (Cinzel, Spectral, tự host qua `@fontsource`) và các lớp trang trí ở `frontend/src/index.css` và `frontend/src/components/royal/`.

## Mạng local: một chain, hai node

```
 node 1 — validator (geth)                 node 2 — RPC node (geth)
 ┌──────────────────────────────┐   p2p    ┌──────────────────────────────┐
 │ giữ khoá signer Clique       │◄────────►│ không giữ khoá nào           │
 │ ký 1 block / 2 giây          │ 30303 ⇄  │ đồng bộ block từ node 1      │
 │ RPC 127.0.0.1:8545 (no CORS) │  30304   │ RPC 127.0.0.1:8546 (CORS *)  │
 └──────────────────────────────┘          └──────────────▲───────────────┘
                                                          │ giao dịch + đọc dữ liệu
                                            frontend (Vite) · MetaMask · Hardhat
```

- Node 1 là validator duy nhất (Clique signer): nó niêm phong block và nhận giao dịch qua p2p. RPC của nó không mở CORS, nên trang web không chạm được vào khoá đang mở khoá.
- Node 2 là cổng vào cho mọi client. Giao dịch gửi tới node 2 được lan sang node 1 để đóng block, rồi block quay lại node 2. Vì vậy cả hai node phải cùng chạy.
- Hai node là static peer của nhau (tắt discovery), chỉ nhận kết nối từ `127.0.0.0/8`. Mỗi block ghi state xuống đĩa ngay (`--gcmode archive`), nên tắt ngang một node không làm chain bị lùi.
- Genesis cấp 10.000 ETH cho 10 tài khoản dev của Hardhat (mnemonic `test test … junk`). Tài khoản #0 deploy và là admin, #9 làm faucet. **Các khoá này ai cũng biết, chỉ dùng cho mạng local.**
- Clique trên geth không hỗ trợ Shanghai/Cancun nên EVM dừng ở London. Hợp đồng được biên dịch với `evmVersion: "paris"` nên chạy bình thường.

Cần: Node 22 và **geth 1.13.x** (1.13.15 là bản cuối còn ký block Clique) trên `PATH`, hoặc đặt biến `GETH_BIN`.

## Ngẫu nhiên khi mở pack: commit-reveal

Chainlink VRF không có trên chain private, nên `PackSale` dùng commit-reveal (phương án dự phòng ở spec §6). Không cần oracle hay tiến trình nào khác.

1. **Commit** — `openPacks(setId, qty, commitment)`: trình duyệt sinh `secret` 32 byte, lưu vào `localStorage` *trước khi* gửi giao dịch, rồi gửi `commitment = keccak256(abi.encode(secret, buyer))`. Pack bị khoá vào yêu cầu, ghi lại `commitBlock`.
2. **Reveal** — `revealPacks(reqId, secret)`, sớm nhất ở block `commitBlock + 2`: hợp đồng kiểm tra commitment, tính `seed = keccak256(secret, blockhash(commitBlock + 1), reqId)`, rút 5×qty thẻ và mint một batch. Event `PackOpened` ghi `seed`, nên ai cũng kiểm chứng lại được lượt rút.
3. **Hết hạn** — `blockhash()` chỉ đọc được 256 block gần nhất. Nếu tới block `commitBlock + 257` vẫn chưa reveal, không ai reveal được nữa; `expireRequest(reqId)` (ai gọi cũng được) hoàn pack về `unopened`.

Lúc commit, người mua chưa biết `blockhash(commitBlock + 1)`; còn validator đóng block đó không biết `secret`. Vì vậy không bên nào chọn trước được thẻ.

**Hạn chế đã biết (giữ theo spec):** sau khi block `commitBlock + 1` được đóng, người mua tự tính được kết quả trước khi reveal. Vì quá hạn thì được hoàn pack, người mua có thể cố tình bỏ một lượt xấu, đợi khoảng 8,5 phút (256 block × 2 giây) rồi mở lại. Muốn chặn hẳn thì đổi `expireRequest` thành huỷ pack thay vì hoàn, đánh đổi bằng việc người quên reveal sẽ mất pack. Ngoài ra, trên chain chỉ có một validator, nhà vận hành có thể thông đồng với người mua; đó là điểm tập trung hoá vốn có của mạng private.

## Chạy

```bash
cd contracts && npm ci --legacy-peer-deps
npm run chain:setup        # một lần: tạo khoá signer, genesis, geth init cho 2 node (contracts/localnet/data)
npm run chain:node1        # terminal 1: validator
npm run chain:node2        # terminal 2: RPC node
npm run chain:status       # 2 node cùng chainId, có peer, cùng block hash
npm run deploy:local       # deploy, ghi deployments.localnet.json và frontend/.env.local
npm run seed:local         # set mẫu (hoặc seed-pokemon:local, hoặc Pack Builder trên giao diện)
npm run smoke:local        # tuỳ chọn: mua 1 pack, commit, reveal, in ra 5 thẻ

cd ../frontend && npm ci --legacy-peer-deps
npm run dev                # http://localhost:5173 — app + /api trên cùng một cổng
```

Sau mỗi lần `deploy:local`, khởi động lại `npm run dev`: Vite chỉ đọc `frontend/.env.local` lúc khởi động.

**Ví (MetaMask trên Chrome):** import khoá riêng của tài khoản dev vào MetaMask (Add account → Import account). Admin là tài khoản #0: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`; người chơi có thể dùng #1: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` (chỉ dùng local). Bấm **Connect wallet**: app tự đề nghị thêm mạng `Localnet` (chainId 105701, RPC `http://127.0.0.1:8546`). Ví khác cần ETH thì chạy `npm run fund -- <địa chỉ> [số ETH]` trong `contracts/`; menu ví trên app có nút copy sẵn lệnh này.

**Mở pack:** Gacha → Buy & open → *Open* (giao dịch commit) → đợi khoảng 2 giây → *Reveal* (giao dịch mint). Bí mật nằm trong trình duyệt đã mở pack; mở ở trình duyệt khác thì Profile → Packs sẽ báo, và sau 256 block có nút **Return packs** để lấy lại pack.

**Reset:** dừng cả 2 node trước (Ctrl+C), rồi `npm run chain:reset`; lệnh này từ chối chạy khi node còn đang chạy. Sau đó chạy lại 2 node, `deploy:local`, `seed:local` rồi khởi động lại `npm run dev`. Nếu MetaMask báo lỗi nonce sau khi reset, vào Settings → Advanced → **Clear activity tab data**.

**Thử trade:** ví B mua và mở pack → niêm yết một thẻ ở Bộ sưu tập (có 1 giao dịch `setApprovalForAll`) → ví C mua ở `/#/market` → ví B rút tiền bán. Mạng private không có Etherscan; nếu tự chạy explorer (vd. Blockscout), đặt `VITE_EXPLORER_URL` để app hiện link giao dịch.

## Kiểm tra

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build    # vitest + test của frontend/api
cd ../contracts && npx hardhat test                              # 42 test (gồm 11 test ĐT-3), chạy trên mạng Hardhat in-process
```

CI chạy cả hai phần, xem `.github/workflows/ci.yml`.

**Phát hành set:** cần `PINATA_JWT` để pin metadata lên IPFS. Tạo API key tại app.pinata.cloud → API Keys (quyền `pinFileToIPFS` là đủ), ghi `PINATA_JWT=<jwt>` vào `frontend/.env` (chỉ phía server, không đặt tên `VITE_*`), rồi khởi động lại `npm run dev`. Sau đó mở `/#/admin/pack-builder` bằng ví admin, chọn 11 thẻ + reward card, Phát hành (pin metadata → `createSet` → `setBaseURI` → `configurePack`). Nếu TCGdex lỗi: `npm run seed-pokemon:local` tạo set Pokémon 151 trên chain và ghi metadata vào `contracts/metadata/`; tên và ảnh thẻ chỉ hiện sau khi pin thư mục đó lên Pinata rồi gọi `setBaseURI("ipfs://<CID>/")`. Set mẫu của `seed:local` không có metadata thật (base URI mặc định `https://example.com/...`), nên Pack Builder sẽ đề nghị ghi metadata thay thế "Card #id" cho các thẻ đó.

**Giá tham chiếu Renaiss:** đang hiển thị “Sắp ra mắt”. Khi có API key: đặt `RENAISS_API_KEY`, `RENAISS_API_SECRET` trong `frontend/.env` và đổi `PRICE_REF_ENABLED` thành `true` trong `frontend/src/lib/features.ts`.

## Tuyên bố miễn trừ

Dự án **phi thương mại, chỉ chạy trên một mạng Ethereum private cục bộ**, không dùng tiền thật, không có thẻ vật lý và thẻ không có giá trị tài chính. Tên và hình ảnh thẻ Pokémon thuộc Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; dự án không liên kết hay được bảo trợ bởi các bên này. Ảnh trỏ trực tiếp về `assets.tcgdex.net`, không được sao chép hay lưu trên IPFS. Giá tham chiếu (nếu có) lấy từ Renaiss OS Index, chỉ để tham khảo. Trang demo sẽ được gỡ sau khi bảo vệ.
