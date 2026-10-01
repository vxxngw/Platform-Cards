import { useEffect, useState, type ReactNode } from 'react'
import { fmtUsd } from '@/lib/tc'
import { ChainWalletMenu } from './ChainWallet'
import { connectWallet } from '@/lib/chain/wallet'
import { ADDR, addrUrl } from '@/lib/chain/config'
import { useConfig, useEthUsd, useMe } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { BRAND, TAGLINE } from '@/lib/brand'
import { Crest, Divider } from '@/components/royal/Ornaments'
import { cn } from '@/lib/utils'

/** Opens Privy's login / connect-wallet modal. The wallet store updates once the user finishes in the modal. */
export async function connectNewWallet(): Promise<void> {
  await connectWallet()
}

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/gacha', label: 'Gacha' },
  { to: '/market', label: 'Marketplace' },
  { to: '/profile', label: 'Profile' },
]

function isActive(path: string, to: string) {
  if (to === '/') return path === '/'
  if (to === '/gacha') return path.startsWith('/gacha') || path.startsWith('/sets')
  if (to === '/profile') return path.startsWith('/profile') || path === '/open' || path === '/collection'
  return path.startsWith(to)
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const me = useMe()
  const cfg = useConfig()
  const ethUsd = useEthUsd()
  const unopened = (me.data?.unopened || []).reduce((s, u) => s + u.count, 0)
  const isAdmin = !!me.data?.wallet?.isAdmin
  const nav = isAdmin ? [...NAV, { to: '/admin', label: 'Admin' }] : NAV
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <header className="sticky top-0 z-40 border-b border-gold/25 bg-[linear-gradient(180deg,rgba(20,14,34,.96),rgba(13,10,22,.9))] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:gap-8">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <Crest className="h-10 w-9 transition group-hover:drop-shadow-[0_0_10px_rgba(214,171,82,.6)]" />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="gold-text font-deco text-lg font-bold">{BRAND}</span>
              <span className="mt-0.5 font-display text-[9px] tracking-[0.3em] text-fg-muted">{TAGLINE.toUpperCase()}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => <NavLink key={n.to} to={n.to} label={n.label} active={isActive(path, n.to)} badge={n.to === '/profile' ? unopened : 0} />)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 font-display text-[11px] tracking-wider text-fg-muted lg:flex">
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald shadow-[0_0_6px_#2f9e74]" />Sepolia</span>
              {ethUsd && <span>ETH {fmtUsd(ethUsd)}</span>}
            </div>
            {mounted && <ChainWalletMenu />}
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-gold/10 px-2 md:hidden">
          {nav.map((n) => <NavLink key={n.to} to={n.to} label={n.label} active={isActive(path, n.to)} badge={n.to === '/profile' ? unopened : 0} />)}
        </nav>
        {cfg.data?.paused && (
          <div className="border-t border-destructive/40 bg-crimson/30 py-1.5 text-center font-display text-xs tracking-wide text-ivory">
            The contracts are paused — card transfers are halted until an admin resumes them.
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-10 border-t border-gold/20 bg-[linear-gradient(180deg,rgba(13,10,22,0),rgba(8,6,14,.9))]">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8">
          <Divider className="mb-8" />
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <Crest className="h-10 w-9" />
                <div>
                  <div className="gold-text font-deco text-lg font-bold">{BRAND}</div>
                  <div className="font-display text-[9px] tracking-[0.3em] text-fg-muted">{TAGLINE.toUpperCase()}</div>
                </div>
              </div>
              <p className="mt-3 max-w-sm text-sm text-fg-subtle">
                Open sealed packs drawn by Chainlink VRF, complete royal sets, and trade cards peer to peer — every move settled on chain.
              </p>
            </div>
            <FooterCol title="Explore" links={[['Home', '#/'], ['Gacha', '#/gacha'], ['Marketplace', '#/market'], ['Profile', '#/profile']]} />
            <FooterCol title="Contracts" links={[
              ['CardCollection', addrUrl(ADDR.collection)], ['PackSale', addrUrl(ADDR.packSale)], ['Marketplace', addrUrl(ADDR.market)],
            ]} external />
            <FooterCol title="Sources" links={[['TCGdex', 'https://tcgdex.dev'], ['Chainlink VRF', 'https://vrf.chain.link'], ['Renaiss OS Index (soon)', 'https://index.renaissos.com']]} external />
          </div>
          <p className="mt-8 border-t border-gold/10 pt-5 text-[11px] leading-5 text-fg-muted">
            Non-commercial academic project running only on the Sepolia testnet — no real money is involved. Cards are digital testnet replicas, not physical cards, and carry no financial value.
            Pokémon names and card images belong to Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; this project is not affiliated with or endorsed by them.
            Card data and images from TCGdex. Market reference prices from Renaiss OS Index are coming soon and will be shown for reference only, never used by the contracts.
          </p>
        </div>
      </footer>
    </div>
  )
}

function NavLink({ to, label, active, badge }: { to: string; label: string; active: boolean; badge: number }) {
  return (
    <Link
      to={to}
      className={cn(
        'relative flex items-center whitespace-nowrap px-3 py-2 font-display text-[13px] font-semibold tracking-[0.14em] uppercase transition',
        active ? 'text-gold-bright' : 'text-fg-subtle hover:text-ivory',
      )}
    >
      {label}
      {badge > 0 && (
        <span className="ml-1.5 rounded-full bg-crimson px-1.5 font-sans text-[10px] font-bold tracking-normal text-ivory ring-1 ring-gold/50">{badge}</span>
      )}
      {active && (
        <span className="absolute inset-x-3 -bottom-px flex items-center justify-center">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold" />
          <span className="mx-1 size-1.5 rotate-45 bg-gold" />
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold" />
        </span>
      )}
    </Link>
  )
}

function FooterCol({ title, links, external }: { title: string; links: [string, string][]; external?: boolean }) {
  return (
    <div>
      <div className="kicker mb-3">{title}</div>
      <ul className="space-y-1.5 text-sm">
        {links.filter(([, href]) => !!href).map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-fg-subtle transition hover:text-gold-bright" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
