// The whole API as one Express app. Vercel runs it as a serverless function (api/[...path].js); `vite dev` mounts it as middleware.
import express from 'express'
import { createPinRouter, makeIsAdmin } from './pin.js'
import { createPriceRouter } from './price.js'
import { createEthRouter } from './eth.js'

export function createApp(env = process.env) {
  const app = express()
  app.set('trust proxy', true) // per-IP rate limit behind Vercel's proxy
  app.disable('x-powered-by')
  app.use('/api/pin', createPinRouter({ isAdmin: makeIsAdmin(env), env }))
  app.use('/api/price', createPriceRouter())
  app.use('/api/eth', createEthRouter())
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))
  return app
}
