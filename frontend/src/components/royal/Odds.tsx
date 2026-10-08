import { RARITY_COLOR, RARITY_NAMES, RARITY_ODDS } from '@/lib/tc'

/** Per-draw odds of the 4 tiers, as gem plaques. */
export function OddsTable() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {RARITY_ODDS.map((p, r) => (
        <div key={r} className="rounded-md border px-2 py-3 text-center" style={{ borderColor: `${RARITY_COLOR[r]}40`, background: `linear-gradient(180deg, ${RARITY_COLOR[r]}14, transparent)` }}>
          <div className="mx-auto mb-1.5 size-2.5 rotate-45" style={{ background: RARITY_COLOR[r], boxShadow: `0 0 10px ${RARITY_COLOR[r]}` }} />
          <div className="font-display text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: RARITY_COLOR[r] }}>{RARITY_NAMES[r]}</div>
          <div className="mt-0.5 font-display text-xl font-bold text-ivory">{p}%</div>
        </div>
      ))}
    </div>
  )
}

export function OddsNotes() {
  return (
    <ul className="space-y-1.5 text-sm text-fg-subtle">
      <li className="flex gap-2"><span className="text-gold">◆</span>The fifth card of every pack is drawn from the Rare+ table, so each pack holds at least one Rare.</li>
      <li className="flex gap-2"><span className="text-gold">◆</span>When a card reaches its max supply, the draw falls to the next tier below.</li>
      <li className="flex gap-2"><span className="text-gold">◆</span>Randomness comes from Chainlink VRF; every opening links its request and transactions on Etherscan.</li>
    </ul>
  )
}
