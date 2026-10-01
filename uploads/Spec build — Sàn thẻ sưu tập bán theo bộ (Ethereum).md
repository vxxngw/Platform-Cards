# Spec build — Sàn thẻ sưu tập bán theo bộ (Ethereum)

Oct 1, 2026 · @vxxngw

## 1. Tổng quan & phạm vi MVP

Đồ án xây một sàn thẻ sưu tập (card) trên Ethereum (testnet Sepolia), nơi thẻ được phát hành theo **bộ (set)**, bán dưới dạng **gói ngẫu nhiên (pack)**, và người dùng giao dịch lại từng thẻ hoặc trọn bộ trên chợ thứ cấp.

Sản phẩm là **thẻ**, không phải NFT độc bản: mỗi mẫu thẻ có nhiều bản giống hệt nhau (ví dụ 10.000 bản thẻ Common), người chơi sở hữu theo số lượng và có thể có thẻ trùng để trao đổi. ERC-1155 chỉ là chuẩn kỹ thuật để lưu số dư thẻ on-chain.

Mục tiêu chứng minh được 4 năng lực blockchain cốt lõi: token hoá tài sản (ERC-1155), thanh toán on-chain bằng ETH, ngẫu nhiên có thể kiểm chứng, và chợ P2P không cần trung gian giữ tiền.

**Trong phạm vi MVP (bắt buộc demo):**

- Admin tạo bộ thẻ, định nghĩa thẻ và tỷ lệ hiếm, mở bán pack
- Người dùng mua pack bằng ETH, mở pack nhận thẻ ngẫu nhiên
- Xem bộ sưu tập, tiến độ hoàn thành từng bộ
- Niêm yết bán / mua / huỷ niêm yết từng thẻ (giá cố định)
- Bán nguyên bộ (bundle listing): mua 1 lần nhận đủ cả bộ
- Đổi bộ hoàn chỉnh lấy thẻ thưởng (set completion reward)

**Mở rộng (Should):** hiển thị giá tham chiếu thị trường của thẻ thật tương ứng, lấy từ [Renaiss Index](https://index.renaissos.com/api-docs), chỉ để tham khảo trên trang Chợ; không đưa giá này vào smart contract.

**Ngoài phạm vi (làm nếu dư thời gian):** đấu giá, offer/trả giá, royalty EIP-2981 cho creator, thanh toán bằng ERC-20, nhiều creator độc lập, indexer The Graph.

## 2. Khái niệm nghiệp vụ

Mỗi **thẻ** là một token ID trong hợp đồng ERC-1155; một **bộ** gom 8–12 thẻ; một **pack** chứa 5 thẻ rút ngẫu nhiên từ đúng một bộ theo bảng độ hiếm.

| Khái niệm | Định nghĩa | Lưu ở đâu |
| --- | --- | --- |
| Card (thẻ) | Token ID ERC-1155, có `setId`, `rarity`, `maxSupply` | `CardCollection` |
| Set (bộ) | Nhóm thẻ cùng chủ đề, có tên, danh sách cardIds, rewardCardId | `CardCollection` |
| Pack (gói) | Vé mua bằng ETH, mở ra 5 thẻ ngẫu nhiên của 1 set | `PackSale` |
| Rarity | Common / Rare / Epic / Legendary | enum on-chain |
| Listing | Lệnh bán 1 thẻ hoặc trọn bộ với giá cố định | `Marketplace` |
| Reward card | Thẻ đặc biệt chỉ có được khi đổi (burn) 1 bộ đầy đủ | `CardCollection` |

**Bảng độ hiếm mặc định (có thể chỉnh theo set):**

| Độ hiếm | Tỷ lệ mỗi lượt rút | Số thẻ/bộ | maxSupply mỗi thẻ |
| --- | --- | --- | --- |
| Common | 60% | 5 | 10.000 |
| Rare | 28% | 3 | 3.000 |
| Epic | 10% | 2 | 800 |
| Legendary | 2% | 1 | 100 |

**Luật đảm bảo:** mỗi pack có tối thiểu 1 thẻ Rare trở lên (slot cuối rút từ bảng Rare+). Khi một thẻ chạm `maxSupply`, lượt rút rơi xuống độ hiếm thấp hơn kế tiếp.

**Giá gợi ý:** 0,01 ETH/pack trên Sepolia; giới hạn mua 10 pack mỗi giao dịch.

## 3. User stories

Hệ thống có 3 vai trò; Admin là ví deployer (role `ADMIN_ROLE` qua OpenZeppelin AccessControl).

| ID | Vai trò | Tôi muốn… | Để… | Ưu tiên |
| --- | --- | --- | --- | --- |
| US-01 | Admin | tạo set mới với danh sách thẻ, độ hiếm, metadata URI | phát hành bộ sưu tập | Must |
| US-02 | Admin | mở/đóng bán pack, đặt giá và số lượng pack | kiểm soát đợt phát hành | Must |
| US-03 | Admin | rút ETH doanh thu từ PackSale và phí sàn | nhận doanh thu | Must |
| US-04 | Admin | tạm dừng hợp đồng (pause) khi có sự cố | giảm thiệt hại | Should |
| US-05 | Người mua | kết nối MetaMask và mua N pack bằng ETH | sở hữu pack | Must |
| US-06 | Người mua | mở pack và xem 5 thẻ nhận được kèm hiệu ứng lật thẻ | có trải nghiệm unbox | Must |
| US-07 | Người mua | xem bộ sưu tập và % hoàn thành từng set | biết còn thiếu thẻ nào | Must |
| US-08 | Người mua | đổi một set đầy đủ lấy reward card | nhận phần thưởng | Should |
| US-09 | Trader | niêm yết bán 1 hoặc nhiều bản của 1 thẻ với giá ETH | bán thẻ trùng | Must |
| US-10 | Trader | mua thẻ đang niêm yết | bổ sung bộ còn thiếu | Must |
| US-11 | Trader | niêm yết bán trọn bộ (bundle) | bán giá cao hơn lẻ | Must |
| US-12 | Trader | huỷ niêm yết | lấy lại quyền tự do với thẻ | Must |
| US-13 | Trader | lọc chợ theo set, độ hiếm, giá | tìm thẻ nhanh | Should |
| US-14 | Mọi người | xem lịch sử giao dịch của một thẻ | đánh giá giá thị trường | Could |

## 4. Kiến trúc & tech stack

Kiến trúc dApp thuần: frontend nói chuyện trực tiếp với 3 hợp đồng trên Sepolia, metadata nằm ở IPFS, random lấy từ Chainlink VRF; không có server lưu trạng thái.

&#91;embedded content: kiến trúc hệ thống · 3 hợp đồng, 3 dịch vụ ngoài\]

CardCollection là trung tâm: chỉ PackSale được mint, Marketplace chỉ giữ thẻ tạm (escrow) khi có listing.

| Lớp | Công nghệ | Ghi chú |
| --- | --- | --- |
| Smart contract | Solidity ^0.8.24, OpenZeppelin v5 | ERC1155, AccessControl, ReentrancyGuard, Pausable |
| Framework | Hardhat + TypeScript (hoặc Foundry) | test, deploy script, verify |
| Random | Chainlink VRF v2.5 | mock khi test local |
| Lưu trữ | IPFS qua Pinata | ảnh + JSON metadata |
| Frontend | Next.js, wagmi, viem, RainbowKit, Tailwind | deploy Vercel |
| Mạng | Ethereum Sepolia | ETH testnet từ faucet |
| Công cụ | Slither, hardhat-gas-reporter, Etherscan | phân tích bảo mật, đo gas |

### 4.1 Dữ liệu giá off-chain (Renaiss Index)

Giá tham chiếu đi đường riêng, không qua chain: Frontend → Next.js API route `/api/price` → `https://api.renaissos.com`. API route giữ `X-Api-Key` + `X-Api-Secret` ở server và cache kết quả 24 giờ.

| Mục | Giá trị |
| --- | --- |
| Endpoint dùng | `GET /v1/index/item-by-no` (set\_name, item\_no, variation, language) |
| Trường hiển thị | `best_estimate`, `currency`, `confidence_tier`, `freshness_days` |
| Hạn mức | Public 10 request/ngày/IP; Partner 10.000/ngày/key (cần xin key) |
| Bắt buộc | Ghi nguồn “Renaiss OS Index” kèm link trang thẻ gốc |

Không dùng Chainlink Functions để đưa giá lên chain: giá chỉ để tham khảo, nên không đáng thêm chi phí và rủi ro oracle cho đồ án giữa kì.

## 5. Thiết kế smart contract

Tách 3 hợp đồng để mỗi cái một trách nhiệm: `CardCollection` giữ token, `PackSale` bán và mở pack, `Marketplace` khớp lệnh mua bán. Solidity ^0.8.24, OpenZeppelin v5.

### 5.1 CardCollection (ERC-1155)

Kế thừa `ERC1155`, `ERC1155Supply`, `AccessControl`, `Pausable`. Chỉ `PackSale` (role `MINTER_ROLE`) được mint thẻ thường.

```solidity
enum Rarity { Common, Rare, Epic, Legendary }

struct Card { uint256 setId; Rarity rarity; uint256 maxSupply; }
struct CardSet { string name; uint256[] cardIds; uint256 rewardCardId; bool active; }

mapping(uint256 => Card) public cards;        // cardId => Card
mapping(uint256 => CardSet) public sets;      // setId  => CardSet
uint256 public nextCardId; uint256 public nextSetId;
```

| Hàm | Quyền | Mô tả |
| --- | --- | --- |
| `createSet(name, rarities[], maxSupplies[], uri)` | ADMIN | Tạo set + các cardId liên tiếp + 1 reward card |
| `mintCards(to, ids[], amounts[])` | MINTER | Gọi từ PackSale khi mở pack; kiểm tra maxSupply |
| `redeemSet(setId)` | user | Burn 1 bản mỗi thẻ trong set, mint 1 reward card |
| `getSetProgress(user, setId)` | view | Trả mảng số dư từng thẻ trong set |
| `uri(id)` | view | `ipfs://<CID>/{id}.json` |
| `pause()` / `unpause()` | ADMIN | Dừng chuyển nhượng khi sự cố |

Events: `SetCreated(setId, name, cardIds)`, `SetRedeemed(user, setId, rewardCardId)`.

### 5.2 PackSale

Nhận ETH, ghi nhận pack chưa mở, xin số ngẫu nhiên, rồi mint thẻ cho người mua.

```solidity
struct PackConfig { uint256 setId; uint256 price; uint256 remaining; bool onSale; }
struct OpenRequest { address buyer; uint256 setId; uint32 count; bool fulfilled; }

mapping(uint256 => PackConfig) public packConfigs;           // setId => config
mapping(address => mapping(uint256 => uint256)) public unopened; // user => setId => số pack
mapping(uint256 => OpenRequest) public requests;             // VRF requestId => request
```

| Hàm | Quyền | Mô tả |
| --- | --- | --- |
| `configurePack(setId, price, supply)` | ADMIN | Đặt giá, tổng pack, bật bán |
| `buyPacks(setId, qty)` payable | user | `msg.value == price*qty`, qty ≤ 10, tăng `unopened` |
| `openPacks(setId, qty)` | user | Giảm `unopened`, gửi yêu cầu VRF, lưu request |
| `fulfillRandomWords(reqId, words[])` | VRF | Suy ra 5×qty lá bài từ random, gọi `mintCards` |
| `withdraw(to)` | ADMIN | Rút ETH doanh thu (pull payment) |

Events: `PacksPurchased(buyer, setId, qty, paid)`, `OpenRequested(reqId, buyer, setId, qty)`, `PackOpened(reqId, buyer, cardIds[])`.

**Thuật toán rút thẻ:** với mỗi lá, `r = uint256(keccak256(word, i)) % 10000`; so với ngưỡng tích luỹ 6000/8800/9800/10000 để chọn độ hiếm, rồi `keccak256(word, i, "card") % số thẻ cùng độ hiếm` để chọn thẻ. Lá thứ 5 dùng bảng Rare+.

### 5.3 Marketplace

Mô hình escrow: khi niêm yết, thẻ được chuyển vào hợp đồng; khi bán, ETH trả cho người bán qua `pendingWithdrawals` (pull) để tránh re-entrancy. Phí sàn 2,5% (`feeBps = 250`).

```solidity
struct Listing { address seller; uint256[] ids; uint256[] amounts; uint256 price; bool active; bool isBundle; }
mapping(uint256 => Listing) public listings;
mapping(address => uint256) public pendingWithdrawals;
```

| Hàm | Quyền | Mô tả |
| --- | --- | --- |
| `listCard(id, amount, price)` | user | Escrow thẻ, tạo listing lẻ |
| `listBundle(setId, price)` | user | Escrow 1 bản mỗi thẻ của set, tạo bundle |
| `buy(listingId)` payable | user | `msg.value == price`, chuyển thẻ cho người mua, ghi có người bán trừ phí |
| `cancel(listingId)` | seller | Trả thẻ về người bán |
| `withdraw()` | user | Rút ETH đã bán được |
| `setFee(bps)` | ADMIN | Tối đa 1000 (10%) |

Events: `Listed(listingId, seller, ids, amounts, price, isBundle)`, `Sold(listingId, buyer, price)`, `Cancelled(listingId)`. Frontend dựng danh sách chợ hoàn toàn từ các event này.

## 6. Random khi mở pack

Chọn **Chainlink VRF v2.5 trên Sepolia** làm phương án chính; commit-reveal là phương án dự phòng nếu không xin được LINK testnet.

Không dùng `block.timestamp`, `blockhash` hay `block.prevrandao` làm nguồn ngẫu nhiên duy nhất: validator và người mua có thể đoán hoặc chọn thời điểm gọi để rút được thẻ Legendary. Đây là điểm giảng viên thường hỏi khi bảo vệ.

| Tiêu chí | Chainlink VRF v2.5 | Commit-reveal |
| --- | --- | --- |
| Độ an toàn | Có bằng chứng mật mã, không ai đoán trước | An toàn nếu reveal đúng hạn; có thể bỏ reveal khi kết quả xấu |
| Số giao dịch người dùng | 1 (open), kết quả về sau 1–3 block | 2 (commit rồi reveal sau ≥1 block) |
| Chi phí | Cần subscription + LINK testnet | Chỉ gas |
| Độ phức tạp code | Kế thừa `VRFConsumerBaseV2Plus` | Tự viết, cần xử lý hết hạn |
| Test local | Dùng `VRFCoordinatorV2_5Mock` | Dễ test |

**Commit-reveal (dự phòng):** `commitOpen(setId, qty, hash(secret))` lưu `block.number`; sau ít nhất 1 block, `revealOpen(secret)` tính seed = `keccak256(secret, blockhash(commitBlock+1))`. Quá 256 block chưa reveal thì pack bị hoàn lại `unopened` để không ai mất pack.

Frontend cần trạng thái chờ “Đang mở pack…” lắng nghe event `PackOpened` theo `reqId`.

**Dẫn chứng thực tế:** Renaiss Fair (fair.renaiss.xyz) là cơ chế rút gacha có thể kiểm chứng của Renaiss trên BNB Chain; người dùng tự kiểm tra kết quả mỗi lần mở pack qua transaction hash. Đồ án áp dụng cùng nguyên tắc trên Ethereum bằng VRF, và trang Mở pack hiển thị `reqId` + link Etherscan để người chơi tự xác minh.

## 7. Luồng nghiệp vụ chính

Bốn luồng dưới đây là kịch bản demo; mỗi bước ghi rõ giao dịch nào lên chain.

**A. Phát hành bộ (Admin)**

1. Upload ảnh + JSON metadata của set lên IPFS, lấy CID.
2. Gọi `CardCollection.createSet(...)` với độ hiếm, maxSupply và `ipfs://CID`.
3. Gọi `PackSale.configurePack(setId, 0.01 ether, 1000)` để mở bán.

**B. Mua và mở pack (Người mua)**

1. Kết nối MetaMask (Sepolia), chọn set, nhập số lượng.
2. Gọi `buyPacks(setId, qty)` kèm ETH → event `PacksPurchased`.
3. Bấm “Mở pack” → `openPacks(setId, qty)` → event `OpenRequested`.
4. Chainlink gọi `fulfillRandomWords` → mint thẻ → event `PackOpened`.
5. Frontend bắt event, hiển thị hiệu ứng lật 5 thẻ.

**C. Bán và mua thẻ lẻ (Trader)**

1. Người bán gọi `setApprovalForAll(marketplace, true)` một lần.
2. Gọi `listCard(id, amount, price)` → thẻ vào escrow, event `Listed`.
3. Người mua gọi `buy(listingId)` kèm đúng ETH → nhận thẻ, event `Sold`.
4. Người bán gọi `withdraw()` để rút ETH (đã trừ 2,5% phí).

**D. Hoàn thành bộ**

1. Trang Collection hiển thị tiến độ, ví dụ 9/11 thẻ.
2. Thiếu thẻ → mua lẻ trên chợ, hoặc mua nguyên bundle qua `listBundle`/`buy`.
3. Đủ bộ → nút “Đổi thưởng” gọi `redeemSet(setId)` → burn 11 thẻ, nhận 1 reward card.

## 8. Metadata & IPFS

Ảnh và JSON thẻ lưu trên IPFS qua Pinata (gói free đủ dùng); on-chain chỉ lưu base URI, setId, độ hiếm và maxSupply.

Cấu trúc thư mục upload (một CID cho cả thư mục, tên file theo chuẩn ERC-1155 là hex 64 ký tự hoặc dùng `uri` override trả `{id}.json`):

```
metadata/
  images/1.png ... 12.png
  1.json ... 12.json
```

Mẫu `1.json`:

```json
{
  "name": "Rồng Lửa #1",
  "description": "Thẻ Legendary thuộc bộ Thần Thú Việt",
  "image": "ipfs://<IMAGES_CID>/1.png",
  "attributes": [
    { "trait_type": "Set", "value": "Thần Thú Việt" },
    { "trait_type": "Rarity", "value": "Legendary" },
    { "trait_type": "Card No.", "value": "1/11" }
  ]
}
```

Độ hiếm trong JSON chỉ để hiển thị; nguồn sự thật là `cards[id].rarity` on-chain. Ảnh thẻ có thể tự vẽ hoặc dùng ảnh AI tự tạo để tránh vấn đề bản quyền.

Để tra giá Renaiss Index, mỗi thẻ có thể khai báo thẻ thật tương ứng trong metadata (thẻ không có trường này thì không hiện giá):

```json
"priceRef": { "set_name": "<tên set thật>", "item_no": "<số thẻ>", "variation": "", "language": "en" }
```

## 9. Frontend

Next.js (App Router) + wagmi/viem + RainbowKit + Tailwind; 6 trang, đọc dữ liệu bằng `readContract` và event log, không cần backend riêng.

| Trang | Route | Chức năng chính | Hợp đồng gọi |
| --- | --- | --- | --- |
| Trang chủ | `/` | Danh sách set đang bán, giá pack, số pack còn lại | PackSale (read) |
| Chi tiết set | `/sets/[id]` | Xem 11 thẻ + độ hiếm, mua pack | CardCollection, PackSale |
| Mở pack | `/open` | Số pack chưa mở, nút mở, hiệu ứng lật thẻ | PackSale |
| Bộ sưu tập | `/collection` | Thẻ đang sở hữu, % hoàn thành set, nút đổi thưởng, nút niêm yết | CardCollection, Marketplace |
| Chợ | `/market` | Lọc theo set/độ hiếm/giá, mua, xem bundle | Marketplace |
| Admin | `/admin` | Tạo set, cấu hình pack, rút tiền, pause | Cả 3 (chỉ hiện với ADMIN) |

Yêu cầu UX: hiện trạng thái giao dịch (chờ ký → đang xác nhận → thành công) kèm link Etherscan; báo lỗi rõ khi sai mạng hoặc thiếu ETH; cảnh báo trước khi `setApprovalForAll`.

Để lấy danh sách listing nhanh, đọc event `Listed`/`Sold`/`Cancelled` từ block deploy bằng `getLogs`. Nếu chậm, thêm subgraph The Graph (ngoài phạm vi MVP).

Trang `/market` thêm ô “Giá tham chiếu thị trường” cạnh mỗi listing có `priceRef`: hiện `best_estimate`, mức tin cậy, số ngày từ lần cập nhật và dòng nguồn “Renaiss OS Index”. Lỗi hoặc hết hạn mức API thì ẩn ô này, không chặn giao dịch.

## 10. Bảo mật và rủi ro

Rủi ro lớn nhất là random bị đoán và re-entrancy khi chuyển ETH/ERC-1155; cả hai đã có biện pháp trong thiết kế.

| Rủi ro | Ở đâu | Biện pháp |
| --- | --- | --- |
| Random dự đoán được | PackSale | Chainlink VRF; không dùng timestamp/blockhash |
| Re-entrancy (callback `onERC1155Received`, chuyển ETH) | Marketplace, PackSale | Checks-Effects-Interactions, `ReentrancyGuard`, pull payment |
| Mint vượt maxSupply | CardCollection | `require(totalSupply(id) + amt <= maxSupply)`; fallback xuống độ hiếm thấp hơn |
| Mua sai số tiền | PackSale, Marketplace | `msg.value` phải bằng đúng giá, không giữ tiền thừa |
| Mua listing đã bán/huỷ | Marketplace | Đặt `active = false` trước khi chuyển tài sản |
| Người bán tự mua để thao túng giá | Marketplace | `require(msg.sender != seller)` |
| Admin lạm quyền | Cả 3 | Giới hạn `feeBps ≤ 1000`; ghi rõ trong báo cáo là điểm tập trung hoá |
| Gas VRF callback vượt giới hạn khi mở nhiều pack | PackSale | Giới hạn qty ≤ 10/lần, đặt `callbackGasLimit` 500.000 và đo thực tế |
| Hết LINK / VRF không phản hồi | PackSale | Hàm `cancelStuckRequest` sau 1 giờ hoàn `unopened` |

Chạy Slither trước khi nộp và đưa kết quả vào báo cáo.

**Rủi ro dữ liệu off-chain:** Renaiss Index đang Beta, độ phủ thẻ chưa đủ; tier public chỉ 10 request/ngày/IP; lộ API secret nếu gọi thẳng từ trình duyệt. Biện pháp: gọi qua API route phía server, cache, xử lý `found = false`, và luôn ghi rõ đây là giá tham khảo.

## 11. Kiểm thử và triển khai

Mục tiêu: coverage ≥ 85% cho 3 hợp đồng bằng Hardhat (hoặc Foundry), VRF giả lập bằng `VRFCoordinatorV2_5Mock`, rồi deploy và verify trên Sepolia.

**Test case tối thiểu:**

- [ ] `createSet` chỉ ADMIN gọi được; tạo đúng số cardId và reward card
- [ ] `buyPacks` revert khi sai `msg.value`, qty > 10, hoặc hết pack
- [ ] `openPacks` + fulfill mock → người mua nhận đúng 5×qty thẻ, có ≥1 Rare+ mỗi pack
- [ ] Thống kê 10.000 lượt rút giả lập lệch ≤ 2% so với tỷ lệ cấu hình
- [ ] Mint không vượt `maxSupply`; fallback độ hiếm hoạt động
- [ ] `listCard`/`buy`/`cancel`: chuyển thẻ, phí 2,5%, `pendingWithdrawals` đúng
- [ ] Mua listing đã bán hoặc đã huỷ → revert
- [ ] Tấn công re-entrancy bằng hợp đồng giả `onERC1155Received` → thất bại
- [ ] `redeemSet` revert khi thiếu thẻ; burn đủ và mint reward khi đủ
- [ ] `pause` chặn chuyển nhượng

**Triển khai:**

1. Tạo subscription VRF tại vrf.chain.link, nạp LINK testnet từ faucet.
2. Deploy `CardCollection` → `PackSale` → `Marketplace`; cấp `MINTER_ROLE` cho PackSale.
3. Thêm PackSale làm consumer của subscription VRF.
4. Verify cả 3 hợp đồng trên Etherscan (`hardhat verify`).
5. Chạy script seed: 1–2 set mẫu, cấu hình pack.
6. Deploy frontend lên Vercel, ghi địa chỉ hợp đồng vào `.env`.

## 12. Timeline, phân công, deliverables

Kế hoạch 6 tuần với 2 mốc kiểm soát: hợp đồng phải pass test cuối tuần 3, và demo chạy trọn luồng trên Sepolia cuối tuần 5.

&#91;embedded content: lộ trình 6 tuần · 5 giai đoạn, 2 mốc\]

Nếu trễ mốc 1, cắt giá tham chiếu Renaiss Index trước, rồi đến bundle listing và redeemSet; giữ nguyên mua/mở pack và chợ thẻ lẻ.

**Phân công gợi ý (nhóm 3 người):**

| Thành viên | Phụ trách chính | Hỗ trợ |
| --- | --- | --- |
| A | CardCollection, PackSale, tích hợp VRF | Deploy, Slither |
| B | Marketplace, toàn bộ test suite | Script seed dữ liệu |
| C | Frontend, IPFS metadata, thiết kế ảnh thẻ | Video demo, slide |

**Deliverables nộp bài:**

- [ ] Repo GitHub: `contracts/`, `test/`, `scripts/`, `frontend/`, README hướng dẫn chạy
- [ ] Địa chỉ 3 hợp đồng đã verify trên Sepolia Etherscan
- [ ] Link frontend trên Vercel
- [ ] Báo cáo: kiến trúc, thiết kế contract, random, bảo mật, kết quả test + coverage, bảng gas
- [ ] Video demo 5–7 phút theo 4 luồng ở mục 7
- [ ] Slide bảo vệ
