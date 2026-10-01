const { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } = require('drizzle-orm/pg-core')

// Off-chain mirror of the 3 contracts (CardCollection / PackSale / Marketplace).
// All ETH amounts are stored in wei (numeric, no decimals).

exports.tc_wallets = pgTable('tc_wallets', {
  address: text('address').primaryKey(),
  label: text('label'),
  balance_wei: numeric('balance_wei', { precision: 78, scale: 0 }).notNull().default('0'),
  pending_wei: numeric('pending_wei', { precision: 78, scale: 0 }).notNull().default('0'), // Marketplace.pendingWithdrawals
  is_admin: boolean('is_admin').notNull().default(false),
  market_approved: boolean('market_approved').notNull().default(false), // setApprovalForAll(marketplace)
  created_at: timestamp('created_at').defaultNow(),
})

exports.tc_sets = pgTable('tc_sets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  base_uri: text('base_uri'),
  reward_card_id: integer('reward_card_id'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow(),
})

exports.tc_cards = pgTable('tc_cards', {
  id: serial('id').primaryKey(),
  set_id: integer('set_id').notNull(),
  name: text('name').notNull(),
  rarity: integer('rarity').notNull(), // 0 Common, 1 Rare, 2 Epic, 3 Legendary, 4 Reward
  max_supply: integer('max_supply').notNull(),
  minted: integer('minted').notNull().default(0), // totalSupply incl. burned history -> we track live supply
  burned: integer('burned').notNull().default(0),
  card_no: integer('card_no').notNull().default(0),
  hue: integer('hue').notNull().default(200),
  is_reward: boolean('is_reward').notNull().default(false),
  price_ref: jsonb('price_ref'),
})

exports.tc_balances = pgTable('tc_balances', {
  key: text('key').primaryKey(), // `${address}:${cardId}`
  address: text('address').notNull(),
  card_id: integer('card_id').notNull(),
  amount: integer('amount').notNull().default(0),
})

exports.tc_pack_configs = pgTable('tc_pack_configs', {
  set_id: integer('set_id').primaryKey(),
  price_wei: numeric('price_wei', { precision: 78, scale: 0 }).notNull(),
  remaining: integer('remaining').notNull(),
  total: integer('total').notNull().default(0),
  on_sale: boolean('on_sale').notNull().default(true),
})

exports.tc_unopened = pgTable('tc_unopened', {
  key: text('key').primaryKey(), // `${address}:${setId}`
  address: text('address').notNull(),
  set_id: integer('set_id').notNull(),
  count: integer('count').notNull().default(0),
})

exports.tc_open_requests = pgTable('tc_open_requests', {
  id: serial('id').primaryKey(),
  req_hash: text('req_hash').notNull(),
  buyer: text('buyer').notNull(),
  set_id: integer('set_id').notNull(),
  count: integer('count').notNull(),
  seed: text('seed'),
  seed_commit: text('seed_commit'),
  card_ids: jsonb('card_ids'),
  status: text('status').notNull().default('pending'), // pending | fulfilled | cancelled
  tx_hash: text('tx_hash'),
  fulfill_tx: text('fulfill_tx'),
  ready_at: timestamp('ready_at'),
  created_at: timestamp('created_at').defaultNow(),
  fulfilled_at: timestamp('fulfilled_at'),
})

exports.tc_listings = pgTable('tc_listings', {
  id: serial('id').primaryKey(),
  seller: text('seller').notNull(),
  ids: jsonb('ids').notNull(),
  amounts: jsonb('amounts').notNull(),
  price_wei: numeric('price_wei', { precision: 78, scale: 0 }).notNull(),
  active: boolean('active').notNull().default(true),
  is_bundle: boolean('is_bundle').notNull().default(false),
  set_id: integer('set_id'),
  buyer: text('buyer'),
  status: text('status').notNull().default('active'), // active | sold | cancelled
  created_at: timestamp('created_at').defaultNow(),
  closed_at: timestamp('closed_at'),
})

exports.tc_events = pgTable('tc_events', {
  id: serial('id').primaryKey(),
  contract: text('contract').notNull(),
  name: text('name').notNull(),
  args: jsonb('args').notNull(),
  tx_hash: text('tx_hash').notNull(),
  block: integer('block').notNull().default(0),
  created_at: timestamp('created_at').defaultNow(),
})

exports.tc_settings = pgTable('tc_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

exports.tc_price_cache = pgTable('tc_price_cache', {
  key: text('key').primaryKey(),
  data: jsonb('data'),
  fetched_at: timestamp('fetched_at').defaultNow(),
})

// Pack Builder metadata when no Pinata JWT is configured (served by routes/metadata.js).
exports.tc_metadata = pgTable('tc_metadata', {
  id: integer('id').primaryKey(),
  data: jsonb('data').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
})
