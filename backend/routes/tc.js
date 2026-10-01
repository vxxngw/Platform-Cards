const { Router } = require('express')
const E = require('../lib/engine')

const router = Router()
const { q, big, formatEth, RARITY } = E

const wrap = (fn) => async (req, res) => {
  try {
    await E.ensureInit()
    const out = await fn(req, res)
    if (!res.headersSent) res.json(out)
  } catch (e) {
    if (e.revert) return res.status(400).json({ error: e.message })
    console.error('[tc]', e)
    res.status(500).json({ error: 'Lỗi máy chủ: ' + (e.message || 'unknown') })
  }
}
const me = (req) => E.normAddr(req.get('x-wallet'))

function cardView(c) {
  return {
    id: c.id, setId: c.set_id, name: c.name, rarity: c.rarity, rarityName: RARITY[c.rarity],
    maxSupply: c.max_supply, supply: c.minted - c.burned, minted: c.minted, burned: c.burned,
    cardNo: c.card_no, hue: c.hue, isReward: c.is_reward, priceRef: c.price_ref || null,
  }
}
function walletView(w) {
  if (!w) return null
  return {
    address: w.address, label: w.label, isAdmin: w.is_admin, marketApproved: w.market_approved,
    balance: formatEth(w.balance_wei), pending: formatEth(w.pending_wei),
  }
}

// ---------- config / wallets ----------
router.get('/config', wrap(async () => {
  const st = await E.readSettingsFresh()
  const g = (k, d) => (st.has(k) ? st.get(k) : d)
  const [admin, paused, fee, pack, mfee] = [g('admin_address'), g('paused', '0'), g('fee_bps', '250'), g('packsale_balance_wei', '0'), g('market_fee_wei', '0')]
  return { adminAddress: admin, paused: paused === '1', feeBps: Number(fee), packRevenue: formatEth(pack), marketFees: formatEth(mfee), maxPacksPerTx: E.MAX_PACKS_PER_TX }
}))

router.post('/wallets', wrap(async (req) => walletView(await E.createWallet(req.body?.label))))

router.get('/wallets', wrap(async (req) => {
  const list = String(req.query.addresses || '').split(',').map(E.normAddr).filter(Boolean).slice(0, 20)
  const rows = await q('SELECT * FROM tc_wallets WHERE is_admin OR address = ANY($1::text[]) ORDER BY is_admin DESC, created_at', [list])
  return rows.map(walletView)
}))

router.get('/me', wrap(async (req) => {
  const [row] = await q(
    `SELECT w.*,
       (SELECT COALESCE(json_agg(json_build_object('setId', u.set_id, 'count', u.count) ORDER BY u.set_id), '[]'::json)
          FROM tc_unopened u WHERE u.address = w.address AND u.count > 0) AS unopened,
       (SELECT COALESCE(json_agg(r.id ORDER BY r.id), '[]'::json)
          FROM tc_open_requests r WHERE r.buyer = w.address AND r.status IN ('pending','fulfilling')) AS pending
     FROM tc_wallets w WHERE w.address = $1`, [me(req)])
  if (!row) return { wallet: null }
  return {
    wallet: walletView(row),
    unopened: (row.unopened || []).map((u) => ({ setId: u.setId, name: E.getSet(u.setId)?.name || `#${u.setId}`, count: u.count })),
    pendingRequests: row.pending || [],
  }
}))

router.post('/faucet', wrap(async (req) => E.faucet(me(req))))

// ---------- sets ----------
function setView(s, p) {
  return {
    id: s.id, name: s.name, description: s.description, rewardCardId: s.reward_card_id, baseUri: s.base_uri,
    pack: !p ? null : { price: formatEth(p.price_wei), remaining: p.remaining, total: p.total, onSale: p.on_sale },
    cards: E.allCards().filter((c) => c.set_id === s.id).map(cardView),
  }
}
router.get('/sets', wrap(async () => {
  const packs = await q('SELECT * FROM tc_pack_configs')
  const pm = new Map(packs.map((p) => [p.set_id, p]))
  return E.allSets().map((s) => setView(s, pm.get(s.id)))
}))

router.get('/sets/:id', wrap(async (req) => {
  const s = E.getSet(req.params.id)
  if (!s) throw new E.Revert('Bộ không tồn tại')
  const [p] = await q('SELECT * FROM tc_pack_configs WHERE set_id=$1', [s.id])
  return setView(s, p)
}))

router.post('/sets', wrap(async (req) => E.createSet(me(req), req.body || {})))
router.post('/sets/:id/pack', wrap(async (req) => E.configurePack(me(req), Number(req.params.id), req.body?.price, req.body?.supply, req.body?.onSale)))
router.post('/sets/:id/redeem', wrap(async (req) => E.redeemSet(me(req), Number(req.params.id))))

// ---------- packs ----------
router.post('/packs/buy', wrap(async (req) => E.buyPacks(me(req), Number(req.body?.setId), req.body?.qty)))
router.post('/packs/open', wrap(async (req) => E.openPacks(me(req), Number(req.body?.setId), req.body?.qty)))

function requestView(r) {
  const cards = Array.isArray(r.card_ids) ? r.card_ids.map((id) => E.getCard(id)).filter(Boolean).map(cardView) : []
  const set = E.getSet(r.set_id)
  const done = r.status === 'fulfilled'
  return {
    reqId: r.id, reqHash: r.req_hash, buyer: r.buyer, setId: r.set_id, setName: set?.name, count: r.count, status: r.status,
    seedCommit: r.seed_commit, seed: done ? r.seed : null, txHash: r.tx_hash, fulfillTx: r.fulfill_tx,
    createdAt: r.created_at, fulfilledAt: r.fulfilled_at, cards,
  }
}

router.get('/packs/requests', wrap(async (req) => {
  const rows = await q('SELECT * FROM tc_open_requests WHERE buyer=$1 ORDER BY id DESC LIMIT 15', [me(req)])
  return rows.map(requestView)
}))
router.get('/packs/requests/:id', wrap(async (req) => requestView(await E.fulfillIfReady(Number(req.params.id)))))

// ---------- collection ----------
router.get('/collection', wrap(async (req) => {
  const addr = me(req)
  const sets = E.allSets()
  const cards = E.allCards()
  const [bal, listed] = await Promise.all([
    q('SELECT card_id, amount FROM tc_balances WHERE address=$1 AND amount > 0', [addr]),
    q('SELECT ids, amounts FROM tc_listings WHERE seller=$1 AND active', [addr]),
  ])
  const balMap = new Map(bal.map((b) => [b.card_id, b.amount]))
  const escrow = new Map()
  for (const l of listed) l.ids.forEach((id, i) => escrow.set(id, (escrow.get(id) || 0) + l.amounts[i]))
  return sets.map((s) => {
    const cs = cards.filter((c) => c.set_id === s.id)
    const main = cs.filter((c) => !c.is_reward)
    const owned = main.filter((c) => (balMap.get(c.id) || 0) > 0).length
    return {
      id: s.id, name: s.name, total: main.length, owned, complete: owned === main.length,
      cards: cs.map((c) => ({ ...cardView(c), balance: balMap.get(c.id) || 0, listed: escrow.get(c.id) || 0 })),
    }
  })
}))

// ---------- marketplace ----------
router.post('/approve', wrap(async (req) => E.approveMarket(me(req), req.body?.approved !== false)))
router.post('/listings', wrap(async (req) => E.listCard(me(req), Number(req.body?.cardId), req.body?.amount, req.body?.price)))
router.post('/listings/bundle', wrap(async (req) => E.listBundle(me(req), Number(req.body?.setId), req.body?.price)))
router.post('/listings/:id/buy', wrap(async (req) => E.buyListing(me(req), Number(req.params.id))))
router.post('/listings/:id/cancel', wrap(async (req) => E.cancelListing(me(req), Number(req.params.id))))
router.post('/withdraw', wrap(async (req) => E.withdrawProceeds(me(req))))

router.get('/listings', wrap(async (req) => {
  const { setId, rarity, min, max, kind, sort } = req.query
  const rows = await q('SELECT * FROM tc_listings WHERE active ORDER BY id DESC LIMIT 300')
  let out = rows.map((l) => ({
    listingId: l.id, seller: l.seller, isBundle: l.is_bundle, setId: l.set_id, setName: E.getSet(l.set_id)?.name || '',
    price: formatEth(l.price_wei), priceWei: String(l.price_wei), createdAt: l.created_at,
    items: l.ids.map((id, i) => ({ card: E.getCard(id) ? cardView(E.getCard(id)) : undefined, amount: l.amounts[i] })),
  }))
  if (setId) out = out.filter((l) => l.setId === Number(setId))
  if (kind === 'single') out = out.filter((l) => !l.isBundle)
  if (kind === 'bundle') out = out.filter((l) => l.isBundle)
  if (rarity !== undefined && rarity !== '') out = out.filter((l) => l.items.some((it) => it.card?.rarity === Number(rarity)))
  const toWei = (v) => { try { return E.parseEth(v) } catch { return null } }
  const minW = min ? toWei(min) : null
  const maxW = max ? toWei(max) : null
  if (minW != null) out = out.filter((l) => BigInt(l.priceWei) >= minW)
  if (maxW != null) out = out.filter((l) => BigInt(l.priceWei) <= maxW)
  if (sort === 'price_asc') out.sort((a, b) => (BigInt(a.priceWei) < BigInt(b.priceWei) ? -1 : 1))
  if (sort === 'price_desc') out.sort((a, b) => (BigInt(a.priceWei) > BigInt(b.priceWei) ? -1 : 1))
  return out
}))

router.get('/cards/:id', wrap(async (req) => {
  const id = Number(req.params.id)
  const c = E.getCard(id)
  if (!c) throw new E.Revert('Thẻ không tồn tại')
  const sales = await q(
    `SELECT args, tx_hash, block, created_at,
       (SELECT COUNT(*)::int FROM tc_balances WHERE card_id=$2 AND amount > 0) AS holders
     FROM tc_events WHERE contract='Marketplace' AND name='Sold'
     AND args->'ids' @> $1::jsonb ORDER BY id DESC LIMIT 50`, [JSON.stringify([id]), id])
  const holders = sales.length ? { n: sales[0].holders } : (await q('SELECT COUNT(*)::int AS n FROM tc_balances WHERE card_id=$1 AND amount > 0', [id]))[0]
  return {
    card: cardView(c),
    holders: holders?.n || 0,
    sales: sales.map((s) => {
      const a = s.args
      const idx = a.ids.indexOf(id)
      const units = a.isBundle ? null : a.amounts[idx]
      return {
        txHash: s.tx_hash, block: s.block, at: s.created_at, isBundle: !!a.isBundle, buyer: a.buyer, seller: a.seller,
        price: formatEth(a.price), unitPrice: units ? formatEth(big(a.price) / BigInt(units)) : null, amount: units,
      }
    }),
  }
}))

// ---------- admin ----------
router.post('/admin/withdraw', wrap(async (req) => E.adminWithdraw(me(req))))
router.post('/admin/pause', wrap(async (req) => E.setPaused(me(req), !!req.body?.paused)))
router.post('/admin/fee', wrap(async (req) => E.setFee(me(req), req.body?.bps)))

router.get('/stats', wrap(async () => {
  const [r] = await q(`SELECT
    (SELECT COALESCE(SUM((args->>'qty')::int),0)::int FROM tc_events WHERE name='PacksPurchased') AS packs,
    (SELECT COUNT(*)::int FROM tc_events WHERE name='Sold') AS sales,
    (SELECT COALESCE(SUM((args->>'price')::numeric),0)::text FROM tc_events WHERE name='Sold') AS vol,
    (SELECT COUNT(*)::int FROM tc_listings WHERE active) AS listings,
    (SELECT COUNT(*)::int FROM tc_wallets WHERE NOT is_admin) AS wallets`)
  return { packsSold: r.packs, sales: r.sales, volume: formatEth(r.vol), activeListings: r.listings, wallets: r.wallets }
}))

router.get('/events', wrap(async (req) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100)
  const rows = await q("SELECT * FROM tc_events WHERE contract <> 'Faucet' ORDER BY id DESC LIMIT $1", [limit])
  return rows.map((e) => ({ id: e.id, contract: e.contract, name: e.name, args: e.args, txHash: e.tx_hash, block: e.block, at: e.created_at }))
}))

module.exports = router
