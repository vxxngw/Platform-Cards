// ETH/USDT spot from Binance's public ticker — used only to show USD hints next to ETH prices.
import { Router } from 'express'

export function createEthRouter({ fetchImpl = fetch } = {}) {
  const router = Router()
  router.get('/', async (_req, res) => {
    try {
      const r = await fetchImpl('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`Binance ${r.status}`)
      const d = await r.json()
      res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      res.json({ pair: 'ETH/USDT', exchange: 'binance', last: Number(d.lastPrice), change24h: Number(d.priceChangePercent), timestamp: Date.now() })
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) })
    }
  })
  return router
}
