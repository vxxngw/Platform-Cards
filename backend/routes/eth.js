// ETH/USDT spot from Binance (via Surf data API) — used only to show USD hints next to ETH prices.
const { Router } = require('express')
const { dataApi } = require('@surf-ai/sdk/server')

const router = Router()
let cache = null

router.get('/', async (_req, res) => {
  try {
    if (cache && Date.now() - cache.at < 60_000) return res.json(cache.data)
    let last = null, change24h = null, timestamp = null
    try {
      const r = await dataApi.exchange.price({ pair: 'ETH/USDT', exchange: 'binance' })
      const row = r?.data?.[0]
      last = row?.last ?? null
      change24h = row?.change_24h_pct ?? null
      timestamp = row?.timestamp ?? null
    } catch {
      // Fallback to Binance public ticker if Surf API key is not configured
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const d = await r.json()
        last = Number(d.lastPrice)
        change24h = Number(d.priceChangePercent)
        timestamp = Date.now()
      }
    }
    const data = { pair: 'ETH/USDT', exchange: 'binance', last, change24h, timestamp }
    cache = { at: Date.now(), data }
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) })
  }
})

module.exports = router
