// ERC-1155 metadata JSON (what uri(id) resolves to).
//  - Sets published from the Pack Builder without a Pinata JWT are stored in tc_metadata and served from there.
//  - Otherwise this serves the demo-mode (off-chain simulation) cards. On Sepolia with Pinata the base URI points at IPFS instead.
const { Router } = require('express')
const E = require('../lib/engine')

const router = Router()

router.get('/:id', async (req, res) => {
  try {
    const id = Number(String(req.params.id).replace(/\.json$/, ''))
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'bad id' })

    let stored = null
    try {
      const rows = await E.q('SELECT data FROM tc_metadata WHERE id=$1', [id])
      if (rows.length) stored = rows[0].data
      else {
        const [{ n }] = await E.q('SELECT COUNT(*)::int AS n FROM tc_metadata')
        // once any Pack Builder metadata exists this deployment is on-chain: never fall back to demo cards for unknown ids
        if (n > 0) return res.status(404).json({ error: 'not found' })
      }
    } catch {
      // table not created yet → demo mode
    }
    if (stored) {
      res.set('Cache-Control', 'public, max-age=60')
      return res.json(stored)
    }

    await E.ensureInit()
    const card = E.getCard(id)
    if (!card) return res.status(404).json({ error: 'not found' })
    const c = { ...card, set_name: E.getSet(card.set_id)?.name }
    const n = E.allCards().filter((x) => x.set_id === c.set_id && !x.is_reward).length
    const out = {
      name: `${c.name} #${c.id}`,
      description: `Thẻ ${E.RARITY[c.rarity]} thuộc bộ ${c.set_name}`,
      image: `ipfs://<IMAGES_CID>/${c.id}.png`,
      attributes: [
        { trait_type: 'Set', value: c.set_name },
        { trait_type: 'Rarity', value: E.RARITY[c.rarity] },
        { trait_type: 'Card No.', value: c.is_reward ? 'Reward' : `${c.card_no}/${n}` },
        { trait_type: 'Max Supply', value: c.max_supply },
      ],
    }
    if (c.price_ref) out.priceRef = c.price_ref
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

module.exports = router
