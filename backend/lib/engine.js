// Off-chain execution engine that mirrors CardCollection / PackSale / Marketplace.
// Every state-changing call returns a pseudo tx hash and emits events with the same
// names and args as the Solidity contracts in /contracts.
const crypto = require('crypto')
const { dbQuery } = require('@surf-ai/sdk/db')

const RARITY = ['Common', 'Rare', 'Epic', 'Legendary', 'Reward']
const WEI = 10n ** 18n
const MAX_PACKS_PER_TX = 10
const CARDS_PER_PACK = 5
const VRF_DELAY_MS = 2500
const GENESIS_BLOCK = 6_812_000
const GENESIS_TS = Date.UTC(2026, 8, 1)

class Revert extends Error {
  constructor(msg) { super(msg); this.status = 400; this.revert = true }
}

let qCount = 0
async function q(sql, params = []) {
  qCount++
  for (let attempt = 0; ; attempt++) {
    try {
      const { rows } = await dbQuery(sql, params)
      return rows
    } catch (e) {
      if (attempt < 2 && /429|RATE_LIMITED/.test(String(e.message))) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
      throw e
    }
  }
}

// ---------- in-memory caches (this process is the only writer) ----------
const cache = { settings: null, cards: null, sets: null }
async function loadCache(force = false) {
  if (!force && cache.cards) return
  const [settings, cards, sets] = await Promise.all([
    q('SELECT key, value FROM tc_settings'),
    q('SELECT * FROM tc_cards ORDER BY id'),
    q('SELECT * FROM tc_sets ORDER BY id'),
  ])
  cache.settings = new Map(settings.map((r) => [r.key, r.value]))
  cache.cards = new Map(cards.map((c) => [c.id, c]))
  cache.sets = new Map(sets.map((x) => [x.id, x]))
}
const allCards = () => [...cache.cards.values()]
const allSets = () => [...cache.sets.values()]
const getCard = (id) => cache.cards.get(Number(id)) || null
const getSet = (id) => cache.sets.get(Number(id)) || null

const hex = (n) => '0x' + crypto.randomBytes(n).toString('hex')
const txHash = () => hex(32)
const blockNow = () => GENESIS_BLOCK + Math.floor((Date.now() - GENESIS_TS) / 12000)
const big = (v) => BigInt(String(v ?? '0').split('.')[0])
const normAddr = (a) => String(a || '').trim().toLowerCase()

function parseEth(str) {
  const s = String(str ?? '').trim()
  if (!/^\d+(\.\d{1,18})?$/.test(s)) throw new Revert('Số ETH không hợp lệ')
  const [i, f = ''] = s.split('.')
  return BigInt(i) * WEI + BigInt((f + '0'.repeat(18)).slice(0, 18))
}
function formatEth(wei) {
  const w = big(wei)
  const i = w / WEI
  const f = (w % WEI).toString().padStart(18, '0').replace(/0+$/, '')
  return f ? `${i}.${f}` : `${i}`
}

async function emit(contract, name, args, tx) {
  await q('INSERT INTO tc_events (contract, name, args, tx_hash, block) VALUES ($1,$2,$3,$4,$5)', [
    contract, name, JSON.stringify(args), tx, blockNow(),
  ])
}

// ---------- settings ----------
async function getSetting(key, def = null) {
  await loadCache()
  return cache.settings.has(key) ? cache.settings.get(key) : def
}
// Revenue counters are updated with SQL arithmetic, so read them fresh.
async function readSettingsFresh() {
  const rows = await q('SELECT key, value FROM tc_settings')
  for (const r of rows) cache.settings.set(r.key, r.value)
  return cache.settings
}
async function setSetting(key, value) {
  await q('INSERT INTO tc_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, String(value)])
  cache.settings.set(key, String(value))
}
async function addSettingWei(key, delta) {
  await q(
    `INSERT INTO tc_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = ((tc_settings.value)::numeric + ($2)::numeric)::text`,
    [key, delta.toString()],
  )
}
async function isPaused() { return (await getSetting('paused', '0')) === '1' }
async function whenNotPaused() { if (await isPaused()) throw new Revert('EnforcedPause: hợp đồng đang tạm dừng') }

// ---------- wallets ----------
async function getWallet(address) {
  const r = await q('SELECT * FROM tc_wallets WHERE address=$1', [normAddr(address)])
  return r[0] || null
}
async function requireWallet(address) {
  const w = await getWallet(address)
  if (!w) throw new Revert('Ví chưa được kết nối')
  return w
}
async function requireAdmin(address) {
  const w = await requireWallet(address)
  if (!w.is_admin) throw new Revert('AccessControlUnauthorizedAccount: cần ADMIN_ROLE')
  return w
}
async function createWallet(label) {
  const address = hex(20)
  const r = await q(
    'INSERT INTO tc_wallets (address, label, balance_wei) VALUES ($1,$2,$3) RETURNING *',
    [address, (label || '').slice(0, 32) || null, (WEI / 2n).toString()],
  )
  return r[0]
}
async function faucet(address) {
  const w = await requireWallet(address)
  if (big(w.balance_wei) >= 2n * WEI) throw new Revert('Faucet chỉ cấp khi số dư dưới 2 ETH')
  const amount = WEI / 5n
  await q('UPDATE tc_wallets SET balance_wei = balance_wei + $2 WHERE address=$1', [w.address, amount.toString()])
  const tx = txHash()
  await emit('Faucet', 'Drip', { to: w.address, amount: amount.toString() }, tx)
  return { tx, amount: formatEth(amount) }
}
async function debit(address, wei) {
  const r = await q(
    'UPDATE tc_wallets SET balance_wei = balance_wei - $2 WHERE address=$1 AND balance_wei >= $2 RETURNING address',
    [address, wei.toString()],
  )
  if (!r.length) throw new Revert('Không đủ ETH để thanh toán (insufficient funds)')
}
async function credit(address, wei, column = 'balance_wei') {
  await q(`UPDATE tc_wallets SET ${column} = ${column} + $2 WHERE address=$1`, [address, wei.toString()])
}

// ---------- card balances ----------
async function addCards(address, cardId, amount) {
  await q(
    `INSERT INTO tc_balances (key, address, card_id, amount) VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET amount = tc_balances.amount + EXCLUDED.amount`,
    [`${address}:${cardId}`, address, cardId, amount],
  )
}
async function subCards(address, cardId, amount) {
  const r = await q(
    'UPDATE tc_balances SET amount = amount - $2 WHERE key=$1 AND amount >= $2 RETURNING amount',
    [`${address}:${cardId}`, amount],
  )
  if (!r.length) throw new Revert(`ERC1155InsufficientBalance: thiếu thẻ #${cardId}`)
}
async function addMany(address, ids, amounts) {
  if (!ids.length) return
  await q(
    `INSERT INTO tc_balances (key, address, card_id, amount)
     SELECT $1 || ':' || v.id, $1, v.id, v.n FROM (SELECT unnest($2::int[]) AS id, unnest($3::int[]) AS n) v
     ON CONFLICT (key) DO UPDATE SET amount = tc_balances.amount + EXCLUDED.amount`,
    [address, ids, amounts],
  )
}
// All-or-nothing: only subtracts if every id has enough balance (single statement).
async function subMany(address, ids, amounts) {
  const r = await q(
    `WITH v AS (SELECT unnest($2::int[]) AS id, unnest($3::int[]) AS n),
     ok AS (SELECT COUNT(*) AS c FROM v JOIN tc_balances b ON b.key = $1 || ':' || v.id AND b.amount >= v.n)
     UPDATE tc_balances b SET amount = b.amount - v.n FROM v
     WHERE b.key = $1 || ':' || v.id AND (SELECT c FROM ok) = $4 RETURNING b.card_id`,
    [address, ids, amounts, ids.length],
  )
  if (r.length !== ids.length) throw new Revert('ERC1155InsufficientBalance: không đủ thẻ')
}

// ---------- CardCollection ----------
async function createSet(admin, { name, description, cards, rewardName }) {
  await requireAdmin(admin)
  name = String(name || '').trim()
  if (!name) throw new Revert('Tên bộ không được trống')
  if (!Array.isArray(cards) || cards.length < 8 || cards.length > 12) throw new Revert('Mỗi bộ cần 8–12 thẻ')
  for (const c of cards) {
    if (!String(c.name || '').trim()) throw new Revert('Tên thẻ không được trống')
    if (![0, 1, 2, 3].includes(Number(c.rarity))) throw new Revert('Độ hiếm không hợp lệ')
    if (!(Number(c.maxSupply) > 0)) throw new Revert('maxSupply phải > 0')
  }
  for (const r of [0, 1, 2, 3]) if (!cards.some((c) => Number(c.rarity) === r)) throw new Revert(`Bộ cần ít nhất 1 thẻ ${RARITY[r]}`)

  const [set] = await q('INSERT INTO tc_sets (name, description) VALUES ($1,$2) RETURNING *', [name, description || null])
  const ids = []
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const [row] = await q(
      `INSERT INTO tc_cards (set_id, name, rarity, max_supply, card_no, hue, price_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [set.id, String(c.name).trim(), Number(c.rarity), Number(c.maxSupply), i + 1,
        Number.isFinite(Number(c.hue)) ? Number(c.hue) : (i * 37 + set.id * 61) % 360,
        c.priceRef ? JSON.stringify(c.priceRef) : null],
    )
    ids.push(row.id)
  }
  const legendaryMax = Math.min(...cards.filter((c) => Number(c.rarity) === 3).map((c) => Number(c.maxSupply)))
  const [reward] = await q(
    `INSERT INTO tc_cards (set_id, name, rarity, max_supply, card_no, hue, is_reward)
     VALUES ($1,$2,4,$3,$4,$5,true) RETURNING id`,
    [set.id, String(rewardName || `${name} — Thẻ thưởng`).trim(), legendaryMax, cards.length + 1, 45],
  )
  await q('UPDATE tc_sets SET reward_card_id=$2, base_uri=$3 WHERE id=$1', [set.id, reward.id, 'api/metadata/{id}'])
  await loadCache(true)
  const tx = txHash()
  await emit('CardCollection', 'SetCreated', { setId: set.id, name, cardIds: ids, rewardCardId: reward.id }, tx)
  return { tx, setId: set.id }
}

async function setCards(setId) {
  await loadCache()
  return allCards().filter((c) => c.set_id === Number(setId))
}

async function redeemSet(address, setId) {
  await whenNotPaused()
  const w = await requireWallet(address)
  if (!getSet(setId)) throw new Revert('Bộ không tồn tại')
  const all = await setCards(setId)
  const cards = all.filter((c) => !c.is_reward)
  const reward = all.find((c) => c.is_reward)
  if (reward.minted - reward.burned + 1 > reward.max_supply) throw new Revert('Thẻ thưởng đã hết maxSupply')
  try {
    await subMany(w.address, cards.map((c) => c.id), cards.map(() => 1))
  } catch (e) {
    throw new Revert('Chưa đủ bộ: cần ít nhất 1 bản mỗi thẻ')
  }
  reward.minted += 1
  for (const c of cards) c.burned += 1
  await q(
    `WITH a AS (UPDATE tc_cards SET burned = burned + 1 WHERE id = ANY($1::int[]) RETURNING 1)
     UPDATE tc_cards SET minted = minted + 1 WHERE id = $2`,
    [cards.map((c) => c.id), reward.id],
  )
  await addCards(w.address, reward.id, 1)
  const tx = txHash()
  await emit('CardCollection', 'SetRedeemed', { user: w.address, setId: Number(setId), rewardCardId: reward.id }, tx)
  return { tx, rewardCardId: reward.id }
}

// ---------- PackSale ----------
async function configurePack(admin, setId, priceEth, supply, onSale) {
  await requireAdmin(admin)
  await loadCache()
  if (!getSet(setId)) throw new Revert('Bộ không tồn tại')
  const price = parseEth(priceEth)
  if (price <= 0n) throw new Revert('Giá phải > 0')
  const n = Number(supply)
  if (!Number.isInteger(n) || n < 0) throw new Revert('Số pack không hợp lệ')
  await q(
    `INSERT INTO tc_pack_configs (set_id, price_wei, remaining, total, on_sale) VALUES ($1,$2,$3,$3,$4)
     ON CONFLICT (set_id) DO UPDATE SET price_wei=EXCLUDED.price_wei, remaining=EXCLUDED.remaining,
       total = tc_pack_configs.total - tc_pack_configs.remaining + EXCLUDED.remaining, on_sale=EXCLUDED.on_sale`,
    [setId, price.toString(), n, !!onSale],
  )
  const tx = txHash()
  await emit('PackSale', 'PackConfigured', { setId: Number(setId), price: price.toString(), supply: n, onSale: !!onSale }, tx)
  return { tx }
}

async function buyPacks(address, setId, qty) {
  await whenNotPaused()
  const w = await requireWallet(address)
  qty = Number(qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PACKS_PER_TX) throw new Revert('Số lượng pack phải từ 1 đến 10')
  const [cfg] = await q('SELECT * FROM tc_pack_configs WHERE set_id=$1', [setId])
  if (!cfg || !cfg.on_sale) throw new Revert('Bộ này chưa mở bán')
  if (cfg.remaining < qty) throw new Revert('Không đủ pack còn lại')
  const cost = big(cfg.price_wei) * BigInt(qty)
  if (big(w.balance_wei) < cost) throw new Revert('Không đủ ETH để thanh toán (insufficient funds)')
  // one atomic statement: decrement supply, charge buyer, credit revenue, add unopened packs
  const r = await q(
    `WITH cfg AS (
       UPDATE tc_pack_configs SET remaining = remaining - $3
       WHERE set_id = $2 AND on_sale AND remaining >= $3
         AND EXISTS (SELECT 1 FROM tc_wallets WHERE address = $1 AND balance_wei >= $4::numeric)
       RETURNING set_id),
     w AS (UPDATE tc_wallets SET balance_wei = balance_wei - $4::numeric WHERE address = $1 AND EXISTS (SELECT 1 FROM cfg) RETURNING 1),
     rev AS (UPDATE tc_settings SET value = (value::numeric + $4::numeric)::text WHERE key = 'packsale_balance_wei' AND EXISTS (SELECT 1 FROM cfg) RETURNING 1),
     u AS (INSERT INTO tc_unopened (key, address, set_id, count) SELECT $5, $1, set_id, $3 FROM cfg
           ON CONFLICT (key) DO UPDATE SET count = tc_unopened.count + EXCLUDED.count RETURNING 1)
     SELECT (SELECT COUNT(*) FROM cfg)::int AS ok, (SELECT COUNT(*) FROM w)::int AS w, (SELECT COUNT(*) FROM u)::int AS u`,
    [w.address, Number(setId), qty, cost.toString(), `${w.address}:${setId}`],
  )
  if (!r[0]?.ok) throw new Revert('Giao dịch thất bại: hết pack hoặc không đủ ETH')
  const tx = txHash()
  await emit('PackSale', 'PacksPurchased', { buyer: w.address, setId: Number(setId), qty, paid: cost.toString() }, tx)
  return { tx, paid: formatEth(cost) }
}

async function openPacks(address, setId, qty) {
  await whenNotPaused()
  const w = await requireWallet(address)
  qty = Number(qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PACKS_PER_TX) throw new Revert('Mỗi lần mở tối đa 10 pack')
  const seed = crypto.randomBytes(32).toString('hex')
  const commit = crypto.createHash('sha256').update(seed).digest('hex')
  const tx = txHash()
  const [req] = await q(
    `WITH u AS (UPDATE tc_unopened SET count = count - $2 WHERE key = $1 AND count >= $2 RETURNING address, set_id)
     INSERT INTO tc_open_requests (req_hash, buyer, set_id, count, seed, seed_commit, tx_hash, ready_at)
     SELECT $3, address, set_id, $2, $4, $5, $6, NOW() + ($7 || ' milliseconds')::interval FROM u RETURNING id`,
    [`${w.address}:${setId}`, qty, hex(32), seed, commit, tx, String(VRF_DELAY_MS)],
  )
  if (!req) throw new Revert('Không đủ pack chưa mở')
  await emit('PackSale', 'OpenRequested', { reqId: req.id, buyer: w.address, setId: Number(setId), qty }, tx)
  return { tx, reqId: req.id }
}

// Deterministic draw (same algorithm the frontend re-runs for verification).
function h(str) { return BigInt('0x' + crypto.createHash('sha256').update(str).digest('hex')) }
function drawCards(seed, cards, count) {
  const byRarity = [0, 1, 2, 3].map((r) => cards.filter((c) => c.rarity === r).sort((a, b) => a.id - b.id))
  const live = new Map(cards.map((c) => [c.id, c.minted - c.burned]))
  const out = []
  for (let k = 0; k < count * CARDS_PER_PACK; k++) {
    const slot = k % CARDS_PER_PACK
    let r = Number(h(`${seed}:${k}`) % 10000n)
    if (slot === CARDS_PER_PACK - 1) r = 6000 + (r % 4000) // guaranteed Rare+ slot
    let rarity = r < 6000 ? 0 : r < 8800 ? 1 : r < 9800 ? 2 : 3
    const pickHash = h(`${seed}:${k}:card`)
    let picked = null
    while (rarity >= 0 && !picked) {
      const pool = byRarity[rarity]
      if (pool.length) {
        const c = pool[Number(pickHash % BigInt(pool.length))]
        if (live.get(c.id) < c.max_supply) picked = c
      }
      if (!picked) rarity-- // maxSupply reached -> fall to next lower rarity
    }
    if (!picked) throw new Revert('Toàn bộ thẻ đã hết maxSupply')
    live.set(picked.id, live.get(picked.id) + 1)
    out.push(picked.id)
  }
  return out
}

const inflight = new Set()
async function fulfillIfReady(reqId) {
  const [req] = await q('SELECT * FROM tc_open_requests WHERE id=$1', [reqId])
  if (!req) throw new Revert('Request không tồn tại')
  if (req.status !== 'pending' || new Date(req.ready_at).getTime() > Date.now()) return req
  if (await isPaused()) return req
  if (inflight.has(req.id)) return req
  inflight.add(req.id)
  try {
    const cards = (await setCards(req.set_id)).filter((c) => !c.is_reward)
    let ids
    try { ids = drawCards(req.seed, cards, req.count) } catch {
      await q(
        `WITH c AS (UPDATE tc_open_requests SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING 1)
         UPDATE tc_unopened SET count = count + $3 WHERE key=$2 AND EXISTS (SELECT 1 FROM c)`,
        [req.id, `${req.buyer}:${req.set_id}`, req.count],
      )
      return { ...req, status: 'cancelled' }
    }
    const counts = new Map()
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
    const cid = [...counts.keys()]
    const cn = [...counts.values()]
    const tx = txHash()
    cid.forEach((id, i) => { const c = getCard(id); if (c) c.minted += cn[i] }) // reserve supply synchronously
    // one atomic statement: lock request, bump supply, mint balances
    const [r] = await q(
      `WITH l AS (UPDATE tc_open_requests SET status='fulfilled', card_ids=$2::jsonb, fulfill_tx=$3, fulfilled_at=NOW()
                  WHERE id=$1 AND status='pending' RETURNING buyer),
       v AS (SELECT unnest($4::int[]) AS id, unnest($5::int[]) AS n),
       c AS (UPDATE tc_cards SET minted = tc_cards.minted + v.n FROM v WHERE tc_cards.id = v.id AND EXISTS (SELECT 1 FROM l) RETURNING 1),
       b AS (INSERT INTO tc_balances (key, address, card_id, amount)
             SELECT l.buyer || ':' || v.id, l.buyer, v.id, v.n FROM v, l
             ON CONFLICT (key) DO UPDATE SET amount = tc_balances.amount + EXCLUDED.amount RETURNING 1)
       SELECT (SELECT COUNT(*) FROM l)::int AS ok, (SELECT COUNT(*) FROM c)::int AS c, (SELECT COUNT(*) FROM b)::int AS b`,
      [req.id, JSON.stringify(ids), tx, cid, cn],
    )
    if (r?.ok) {
      await emit('PackSale', 'PackOpened', { reqId: Number(req.id), buyer: req.buyer, cardIds: ids }, tx)
      return { ...req, status: 'fulfilled', card_ids: ids, fulfill_tx: tx, fulfilled_at: new Date().toISOString() }
    }
    cid.forEach((id, i) => { const c = getCard(id); if (c) c.minted -= cn[i] })
    return (await q('SELECT * FROM tc_open_requests WHERE id=$1', [reqId]))[0]
  } finally {
    inflight.delete(req.id)
  }
}

// ---------- Marketplace ----------
async function approveMarket(address, approved) {
  const w = await requireWallet(address)
  await q('UPDATE tc_wallets SET market_approved=$2 WHERE address=$1', [w.address, !!approved])
  const tx = txHash()
  await emit('CardCollection', 'ApprovalForAll', { account: w.address, operator: 'Marketplace', approved: !!approved }, tx)
  return { tx }
}

async function listCard(address, cardId, amount, priceEth) {
  await whenNotPaused()
  const w = await requireWallet(address)
  if (!w.market_approved) throw new Revert('Cần setApprovalForAll cho Marketplace trước')
  amount = Number(amount)
  if (!Number.isInteger(amount) || amount < 1) throw new Revert('Số lượng không hợp lệ')
  const price = parseEth(priceEth)
  if (price <= 0n) throw new Revert('Giá phải > 0')
  await loadCache()
  const card = getCard(cardId)
  if (!card) throw new Revert('Thẻ không tồn tại')
  await subCards(w.address, card.id, amount) // escrow
  const [l] = await q(
    'INSERT INTO tc_listings (seller, ids, amounts, price_wei, set_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [w.address, JSON.stringify([card.id]), JSON.stringify([amount]), price.toString(), card.set_id],
  )
  const tx = txHash()
  await emit('Marketplace', 'Listed', { listingId: l.id, seller: w.address, ids: [card.id], amounts: [amount], price: price.toString(), isBundle: false }, tx)
  return { tx, listingId: l.id }
}

async function listBundle(address, setId, priceEth) {
  await whenNotPaused()
  const w = await requireWallet(address)
  if (!w.market_approved) throw new Revert('Cần setApprovalForAll cho Marketplace trước')
  const price = parseEth(priceEth)
  if (price <= 0n) throw new Revert('Giá phải > 0')
  const cards = (await setCards(setId)).filter((c) => !c.is_reward)
  if (!cards.length) throw new Revert('Bộ không tồn tại')
  const ids = cards.map((c) => c.id)
  const amounts = ids.map(() => 1)
  try { await subMany(w.address, ids, amounts) } catch { throw new Revert('Chưa đủ bộ để bán nguyên bộ') }
  const [l] = await q(
    'INSERT INTO tc_listings (seller, ids, amounts, price_wei, set_id, is_bundle) VALUES ($1,$2,$3,$4,$5,true) RETURNING id',
    [w.address, JSON.stringify(ids), JSON.stringify(amounts), price.toString(), Number(setId)],
  )
  const tx = txHash()
  await emit('Marketplace', 'Listed', { listingId: l.id, seller: w.address, ids, amounts, price: price.toString(), isBundle: true }, tx)
  return { tx, listingId: l.id }
}

async function buyListing(address, listingId) {
  await whenNotPaused()
  const w = await requireWallet(address)
  const [l] = await q('SELECT * FROM tc_listings WHERE id=$1', [listingId])
  if (!l || !l.active) throw new Revert('Listing không còn hiệu lực')
  if (l.seller === w.address) throw new Revert('Người bán không thể tự mua listing của mình')
  // Effects first: deactivate before moving assets
  const lock = await q("UPDATE tc_listings SET active=false, status='sold', buyer=$2, closed_at=NOW() WHERE id=$1 AND active RETURNING id", [l.id, w.address])
  if (!lock.length) throw new Revert('Listing không còn hiệu lực')
  const price = big(l.price_wei)
  try { await debit(w.address, price) } catch (e) {
    await q("UPDATE tc_listings SET active=true, status='active', buyer=NULL, closed_at=NULL WHERE id=$1", [l.id]); throw e
  }
  const feeBps = BigInt(await getSetting('fee_bps', '250'))
  const fee = (price * feeBps) / 10000n
  await credit(l.seller, price - fee, 'pending_wei')
  await addSettingWei('market_fee_wei', fee)
  await addMany(w.address, l.ids, l.amounts)
  const tx = txHash()
  await emit('Marketplace', 'Sold', { listingId: l.id, buyer: w.address, seller: l.seller, price: price.toString(), fee: fee.toString(), ids: l.ids, amounts: l.amounts, isBundle: l.is_bundle }, tx)
  return { tx }
}

async function cancelListing(address, listingId) {
  await whenNotPaused()
  const w = await requireWallet(address)
  const lock = await q("UPDATE tc_listings SET active=false, status='cancelled', closed_at=NOW() WHERE id=$1 AND active AND seller=$2 RETURNING *", [listingId, w.address])
  if (!lock.length) throw new Revert('Chỉ người bán mới huỷ được listing đang hoạt động')
  const l = lock[0]
  await addMany(w.address, l.ids, l.amounts)
  const tx = txHash()
  await emit('Marketplace', 'Cancelled', { listingId: l.id }, tx)
  return { tx }
}

async function withdrawProceeds(address) {
  const w = await requireWallet(address)
  const r = await q(
    `UPDATE tc_wallets t SET balance_wei = t.balance_wei + o.old, pending_wei = 0
     FROM (SELECT pending_wei AS old FROM tc_wallets WHERE address=$1) o
     WHERE t.address=$1 AND t.pending_wei > 0 RETURNING o.old`,
    [w.address],
  )
  if (!r.length) throw new Revert('Không có ETH chờ rút')
  const amount = big(r[0].old)
  const tx = txHash()
  await emit('Marketplace', 'Withdrawn', { to: w.address, amount: amount.toString() }, tx)
  return { tx, amount: formatEth(amount) }
}

// ---------- Admin ----------
async function adminWithdraw(admin) {
  const w = await requireAdmin(admin)
  const fresh = await readSettingsFresh()
  const pack = big(fresh.get('packsale_balance_wei') || '0')
  const fee = big(fresh.get('market_fee_wei') || '0')
  if (pack + fee === 0n) throw new Revert('Không có doanh thu để rút')
  await setSetting('packsale_balance_wei', '0')
  await setSetting('market_fee_wei', '0')
  await credit(w.address, pack + fee)
  const tx = txHash()
  await emit('PackSale', 'Withdrawn', { to: w.address, packRevenue: pack.toString(), marketFees: fee.toString() }, tx)
  return { tx, amount: formatEth(pack + fee) }
}
async function setPaused(admin, paused) {
  await requireAdmin(admin)
  await setSetting('paused', paused ? '1' : '0')
  const tx = txHash()
  await emit('CardCollection', paused ? 'Paused' : 'Unpaused', { account: normAddr(admin) }, tx)
  return { tx }
}
async function setFee(admin, bps) {
  await requireAdmin(admin)
  bps = Number(bps)
  if (!Number.isInteger(bps) || bps < 0 || bps > 1000) throw new Revert('Phí tối đa 1000 bps (10%)')
  await setSetting('fee_bps', bps)
  const tx = txHash()
  await emit('Marketplace', 'FeeUpdated', { bps }, tx)
  return { tx }
}

// ---------- bootstrap / seed ----------
const SEED_SETS = [
  {
    name: 'Thần Thú Việt',
    description: 'Linh vật trong truyền thuyết Việt Nam — rồng, phượng, rùa thần và những thần thú canh giữ đất trời.',
    rewardName: 'Long Mẫu Thăng Long',
    cards: [
      { name: 'Rồng Lửa', rarity: 3, maxSupply: 100, hue: 12, priceRef: { game: 'pokemon', q: 'charizard base set' } },
      { name: 'Phượng Hoàng Lửa', rarity: 2, maxSupply: 800, hue: 28 },
      { name: 'Kỳ Lân Ngọc', rarity: 2, maxSupply: 800, hue: 160 },
      { name: 'Rùa Thần Hồ Gươm', rarity: 1, maxSupply: 3000, hue: 200, priceRef: { game: 'pokemon', q: 'blastoise base set' } },
      { name: 'Hạc Tiên', rarity: 1, maxSupply: 3000, hue: 190 },
      { name: 'Bạch Hổ', rarity: 1, maxSupply: 3000, hue: 230 },
      { name: 'Nghê Đá', rarity: 0, maxSupply: 10000, hue: 40 },
      { name: 'Cá Chép Hoá Rồng', rarity: 0, maxSupply: 10000, hue: 0, priceRef: { game: 'pokemon', q: 'magikarp base set' } },
      { name: 'Chim Lạc', rarity: 0, maxSupply: 10000, hue: 95 },
      { name: 'Trâu Vàng', rarity: 0, maxSupply: 10000, hue: 50 },
      { name: 'Rắn Thần', rarity: 0, maxSupply: 10000, hue: 130 },
    ],
  },
  {
    name: 'Ngũ Hành Kiếm Khách',
    description: 'Năm hệ Kim – Mộc – Thuỷ – Hoả – Thổ, mỗi hệ một dòng kiếm khách. Gom đủ để triệu hồi Ngũ Hành Hợp Nhất.',
    rewardName: 'Ngũ Hành Hợp Nhất',
    cards: [
      { name: 'Kiếm Thánh Hư Không', rarity: 3, maxSupply: 100, hue: 275 },
      { name: 'Kim Long Kiếm Sĩ', rarity: 2, maxSupply: 800, hue: 48 },
      { name: 'Hoả Diệm Đao Khách', rarity: 2, maxSupply: 800, hue: 8 },
      { name: 'Mộc Lâm Cung Thủ', rarity: 1, maxSupply: 3000, hue: 120 },
      { name: 'Thuỷ Nguyệt Thích Khách', rarity: 1, maxSupply: 3000, hue: 210 },
      { name: 'Thổ Sơn Hộ Vệ', rarity: 1, maxSupply: 3000, hue: 30 },
      { name: 'Kim Binh', rarity: 0, maxSupply: 10000, hue: 55 },
      { name: 'Mộc Đồng', rarity: 0, maxSupply: 10000, hue: 105 },
      { name: 'Thuỷ Lính', rarity: 0, maxSupply: 10000, hue: 195 },
      { name: 'Hoả Tốt', rarity: 0, maxSupply: 10000, hue: 15 },
      { name: 'Thổ Phu', rarity: 0, maxSupply: 10000, hue: 35 },
    ],
  },
]

let initPromise = null
function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await loadCache()
      if (await getSetting('initialized')) return
      const admin = hex(20)
      await q('INSERT INTO tc_wallets (address, label, balance_wei, is_admin, market_approved) VALUES ($1,$2,$3,true,true)', [admin, 'Deployer (Admin)', WEI.toString()])
      await setSetting('admin_address', admin)
      await setSetting('fee_bps', 250)
      await setSetting('paused', '0')
      await setSetting('packsale_balance_wei', '0')
      await setSetting('market_fee_wei', '0')
      await emit('CardCollection', 'RoleGranted', { role: 'ADMIN_ROLE', account: admin }, txHash())
      await emit('CardCollection', 'RoleGranted', { role: 'MINTER_ROLE', account: 'PackSale' }, txHash())
      for (const s of SEED_SETS) {
        const { setId } = await createSet(admin, s)
        await configurePack(admin, setId, '0.01', 1000, true)
      }
      await setSetting('initialized', '1')
    })().catch((e) => { initPromise = null; throw e })
  }
  return initPromise
}

module.exports = {
  loadCache, allCards, allSets, getCard, getSet, readSettingsFresh, qStats: () => qCount,
  RARITY, Revert, q, big, normAddr, formatEth, parseEth, getSetting, isPaused, getWallet, ensureInit,
  createWallet, faucet, createSet, setCards, redeemSet, configurePack, buyPacks, openPacks, fulfillIfReady,
  approveMarket, listCard, listBundle, buyListing, cancelListing, withdrawProceeds, adminWithdraw, setPaused, setFee,
  MAX_PACKS_PER_TX, CARDS_PER_PACK,
}
