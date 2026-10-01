import { fmtEth, short, type ChainEvent } from './tc'

const eth = (wei: unknown, d = 5) => `${fmtEth(Number(wei) / 1e18, d)} ETH`
const who = (a: unknown, me?: string | null) => (me && String(a).toLowerCase() === me.toLowerCase() ? 'You' : short(String(a)))

export type EventKind = 'pack' | 'open' | 'pull' | 'list' | 'sale' | 'cancel' | 'reward' | 'admin' | 'coin'

/** One line per contract event, in plain English. `me` turns the wallet's own address into "You". */
export function describeEvent(e: ChainEvent, me?: string | null): { kind: EventKind; text: string } {
  const a = e.args as Record<string, any>
  const name = a.cardName ? `“${a.cardName}”` : ''
  switch (e.name) {
    case 'PacksPurchased': return { kind: 'pack', text: `${who(a.buyer, me)} bought ${a.qty} pack${a.qty > 1 ? 's' : ''}${a.setName ? ` of ${a.setName}` : ''} for ${eth(a.paid, 4)}` }
    case 'OpenRequested': return { kind: 'open', text: `${who(a.buyer, me)} broke the seal on ${a.qty} pack${a.qty > 1 ? 's' : ''}${a.setName ? ` of ${a.setName}` : ''}` }
    case 'RandomnessReady': return { kind: 'open', text: `Chainlink VRF answered request ${short(String(a.reqId), 6)} — cards ready to claim` }
    case 'PackOpened': return { kind: 'pull', text: `${who(a.buyer, me)} claimed ${a.cardIds?.length ?? 0} cards${name ? `, best pull ${name}` : ''}` }
    case 'RequestCancelled': return { kind: 'cancel', text: `Request ${short(String(a.reqId), 6)} was withdrawn and its packs returned` }
    case 'Listed': return { kind: 'list', text: `${who(a.seller, me)} listed ${a.isBundle ? `the full set${name ? ` ${name}` : ''}` : `${a.amounts?.[0] ?? 1}× ${name || `card #${a.ids?.[0]}`}`} for ${eth(a.price)}` }
    case 'Sold':
      if (a.side === 'buy') return { kind: 'sale', text: `You bought ${name || `listing #${a.listingId}`} for ${eth(a.price)}` }
      if (a.side === 'sell') return { kind: 'sale', text: `You sold ${name || `listing #${a.listingId}`} for ${eth(a.price)}` }
      return { kind: 'sale', text: `Listing #${a.listingId}${name ? ` (${name})` : ''} sold to ${who(a.buyer, me)} for ${eth(a.price)}` }
    case 'Cancelled': return { kind: 'cancel', text: `Listing #${a.listingId}${name ? ` (${name})` : ''} was withdrawn` }
    case 'SetRedeemed': return { kind: 'reward', text: `${who(a.user, me)} completed ${a.setName ?? `set #${a.setId}`} and claimed the reward ${name || `#${a.rewardCardId}`}` }
    case 'SetCreated': return { kind: 'admin', text: `New set “${a.name}” forged · ${a.cardIds?.length ?? 0} cards + 1 reward` }
    case 'PackConfigured': return { kind: 'admin', text: `Packs of set #${a.setId} ${a.onSale === false ? 'closed' : 'on sale'} · ${eth(a.price, 4)} · ${a.supply} packs` }
    case 'ApprovalForAll': return { kind: 'admin', text: `${who(a.account, me)} ${a.approved ? 'approved' : 'revoked'} the Marketplace` }
    case 'Withdrawn': return { kind: 'coin', text: `${who(a.to, me)} withdrew ${eth(a.amount)}` }
    case 'Paused': return { kind: 'admin', text: 'An admin paused the contracts' }
    case 'Unpaused': return { kind: 'admin', text: 'An admin resumed the contracts' }
    case 'FeeUpdated': return { kind: 'admin', text: `Marketplace fee set to ${a.bps / 100}%` }
    default: return { kind: 'admin', text: e.name }
  }
}
