import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Copy, Droplets, LogOut, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { http, sendTx, short, fmtEth, fmtUsd, useWalletStore, walletStore, CHAIN_MODE, type Wallet } from '@/lib/tc'
import { ChainWalletMenu } from './ChainWallet'
import { connectInjected } from '@/lib/chain/wallet'
import { useConfig, useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export async function connectNewWallet(label?: string) {
  if (CHAIN_MODE) { await connectInjected(); return null as unknown as Wallet }
  const w = await http<Wallet>('tc/wallets', { method: 'POST', json: { label: label || null } })
  walletStore.select(w.address)
  toast.success('Đã kết nối ví demo', { description: `${short(w.address)} · nhận 0.5 ETH testnet` })
  return w
}

function WalletMenu() {
  const { list, current } = useWalletStore()
  const me = useMe()
  const refresh = useRefresh()
  const ethUsd = useEthUsd()
  const wallets = useQuery({
    queryKey: ['wallets', list.join(',')],
    queryFn: () => http<Wallet[]>(`tc/wallets?addresses=${list.join(',')}`),
  })
  const w = me.data?.wallet

  if (!current) {
    return <Button size="sm" onClick={() => connectNewWallet().then(refresh)}>Kết nối ví</Button>
  }
  const nextLabel = `Ví ${String.fromCharCode(65 + Math.min(list.length, 25))}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-sm hover:bg-bg-subtle-hover">
          <span className="font-mono tabular-nums">{w ? `${fmtEth(w.balance)} ETH` : '…'}</span>
          <span className="h-4 w-px bg-border" />
          <span className="text-fg-subtle">{w?.label || short(current)}</span>
          {w?.isAdmin && <span className="rounded bg-primary/15 px-1 text-[10px] font-bold text-primary">ADMIN</span>}
          <ChevronDown className="size-3.5 text-fg-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="space-y-1">
          <div className="flex items-center justify-between font-mono text-xs">
            <span>{short(current, 10)}</span>
            <button className="text-fg-muted hover:text-fg-base" onClick={() => { navigator.clipboard?.writeText(current); toast('Đã copy địa chỉ') }}><Copy className="size-3.5" /></button>
          </div>
          {w && <div className="text-xs font-normal text-fg-muted">{fmtEth(w.balance, 6)} ETH {ethUsd ? `≈ ${fmtUsd(Number(w.balance) * ethUsd)}` : ''}</div>}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => sendTx('Faucet Sepolia', 'tc/faucet').then(refresh).catch(() => {})}>
          <Droplets /> Nhận 0.2 ETH testnet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-fg-muted">Chuyển tài khoản</DropdownMenuLabel>
        {(wallets.data || []).map((x) => (
          <DropdownMenuItem key={x.address} onClick={() => { walletStore.select(x.address); refresh() }} className={cn(x.address === current && 'bg-bg-subtle')}>
            <span className="flex-1 truncate">{x.label || short(x.address)}</span>
            <span className="font-mono text-xs text-fg-muted">{fmtEth(x.balance, 3)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => connectNewWallet(nextLabel).then(refresh)}><Plus /> Tạo ví demo mới</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => walletStore.disconnect()}><LogOut /> Ngắt kết nối</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
            {mounted && (CHAIN_MODE ? <ChainWalletMenu /> : <WalletMenu />)}
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
          Dữ liệu thẻ từ <a className="underline hover:text-fg-base" href="https://tcgdex.dev" target="_blank" rel="noreferrer">TCGdex</a>, giá tham chiếu từ <a className="underline hover:text-fg-base" href="https://index.renaissos.com" target="_blank" rel="noreferrer">Renaiss OS Index</a> (chỉ để tham khảo).
        </p>
        <p>
          {CHAIN_MODE
            ? 'Dữ liệu đọc trực tiếp từ 3 hợp đồng CardCollection · PackSale · Marketplace trên Sepolia (số dư, event). Giao dịch ký bằng ví của bạn; giá tham chiếu chỉ để tham khảo, không đưa vào hợp đồng.'
            : 'Bản demo chạy mô phỏng off-chain, bám đúng logic 3 hợp đồng CardCollection · PackSale · Marketplace (event, phí 2,5%, escrow, pull payment, maxSupply). Mã giao dịch là mã mô phỏng. Ví là ví demo trong trình duyệt, không cần MetaMask.'}
        </p>
      </footer>
    </div>
  )
}
