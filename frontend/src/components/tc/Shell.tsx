import { useEffect, useState, type ReactNode } from 'react'
import { fmtUsd } from '@/lib/tc'
import { ChainWalletMenu } from './ChainWallet'
import { connectWallet } from '@/lib/chain/wallet'
import { useConfig, useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { cn } from '@/lib/utils'

/** Opens Privy's login / connect-wallet modal. The wallet store updates once the user finishes in the modal. */
export async function connectNewWallet(): Promise<void> {
  await connectWallet()
}

const NAV = [
  { to: '/', label: 'Bộ thẻ' },
  { to: '/open', label: 'Mở pack' },
  { to: '/collection', label: 'Bộ sưu tập' },
  { to: '/market', label: 'Chợ' },
]

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const me = useMe()
  const cfg = useConfig()
  const ethUsd = useEthUsd()
  const unopened = (me.data?.unopened || []).reduce((s, u) => s + u.count, 0)
  const isAdmin = !!me.data?.wallet?.isAdmin
  const nav = isAdmin ? [...NAV, { to: '/admin', label: 'Admin' }] : NAV
  const active = (to: string) => (to === '/' ? path === '/' || path.startsWith('/sets') : path.startsWith(to))
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link to="/" className="flex items-baseline gap-1.5 font-black tracking-tight">
            <span className="text-lg">Sàn Thẻ Bộ</span><span className="text-primary">.</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={cn('relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-fg-subtle hover:text-fg-base', active(n.to) && 'bg-bg-subtle text-fg-base')}>
                {n.label}
                {n.to === '/open' && unopened > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{unopened}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-fg-muted md:flex">
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" />Sepolia</span>
              {ethUsd && <span className="font-mono">ETH {fmtUsd(ethUsd)}</span>}
            </div>
            {mounted && <ChainWalletMenu />}
          </div>
        </div>
        {cfg.data?.paused && (
          <div className="border-t border-destructive/30 bg-destructive/10 py-1.5 text-center text-xs text-destructive">
            Hợp đồng đang tạm dừng (pause) — mọi giao dịch chuyển thẻ bị chặn cho đến khi Admin mở lại.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl space-y-1.5 px-4 pb-8 pt-4 text-[11px] leading-5 text-fg-muted">
        <p>
          Dự án học thuật phi thương mại, chỉ chạy trên mạng thử nghiệm Sepolia, không dùng tiền thật. Thẻ là bản số trên testnet, không phải thẻ vật lý, không có giá trị tài chính.
          Tên và hình ảnh thẻ Pokémon thuộc Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; dự án không liên kết hay được bảo trợ bởi các bên này.
          Dữ liệu thẻ từ <a className="underline hover:text-fg-base" href="https://tcgdex.dev" target="_blank" rel="noreferrer">TCGdex</a>, giá tham chiếu từ <a className="underline hover:text-fg-base" href="https://index.renaissos.com" target="_blank" rel="noreferrer">Renaiss OS Index</a> (sắp ra mắt, chỉ để tham khảo).
        </p>
        <p>
          {'Dữ liệu đọc trực tiếp từ 3 hợp đồng CardCollection · PackSale · Marketplace trên Sepolia (số dư, event). Giao dịch ký bằng ví của bạn; giá tham chiếu chỉ để tham khảo, không đưa vào hợp đồng.'}
        </p>
      </footer>
    </div>
  )
}
