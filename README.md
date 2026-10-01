# Sàn Thẻ Bộ — thẻ Pokémon TCG bản số trên Sepolia

Đồ án học thuật: phát hành thẻ theo bộ, bán pack ngẫu nhiên (Chainlink VRF), chợ thứ cấp. Thẻ là **bản số trên testnet** của thẻ Pokémon TCG, dữ liệu lấy từ [TCGdex](https://tcgdex.dev).

| Thư mục | Nội dung |
|---|---|
| `contracts/` | `CardCollection`, `PackSale`, `Marketplace` (xem [contracts/README.md](contracts/README.md)) |
| `backend/` | API: `/api/pin` (Pinata, chỉ admin), `/api/price` (Renaiss Index, cache 24h), `/api/metadata` |
| `frontend/` | Vite + React; `/admin/pack-builder` duyệt TCGdex và phát hành set |

Biến môi trường: `backend/.env.example` (`PINATA_JWT`, `RENAISS_API_KEY`, `RENAISS_API_SECRET` chỉ ở server), `contracts/.env.example`, `frontend/.env.example`.

## Tuyên bố miễn trừ

Dự án **phi thương mại, chỉ chạy trên mạng thử nghiệm Sepolia**, không dùng tiền thật, không có thẻ vật lý và thẻ không có giá trị tài chính. Tên và hình ảnh thẻ Pokémon thuộc Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; dự án không liên kết hay được bảo trợ bởi các bên này. Ảnh trỏ trực tiếp về `assets.tcgdex.net`, không được sao chép hay lưu trên IPFS. Giá tham chiếu (nếu có) lấy từ Renaiss OS Index, chỉ để tham khảo. Trang demo sẽ được gỡ sau khi bảo vệ.
