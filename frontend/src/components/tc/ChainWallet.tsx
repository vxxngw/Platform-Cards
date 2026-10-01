import { useEffect } from 'react'
import { ChevronDown, Copy, ExternalLink, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fmtEth, fmtUsd, short, useWalletStore, walletStore } from '@/lib/tc'
import { useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { CHAIN_ID, addrUrl } from '@/lib/chain/config'
import { chain } from '@/lib/chain/client'
import { connectInjected, ensureChain, initChainWallet, useWalletChainId } from '@/lib/chain/wallet'

export function ChainWalletMenu() {
  const { current } = useWalletStore()
  const chainId = useWalletChainId()
  const me = useMe()
  const refresh = useRefresh()
  const ethUsd = useEthUsd()
  useEffect(() => { initChainWallet() }, [])

  if (!current) {
    return <Button size="sm" onClick={() => connectInjected().then(refresh).catch(() => {})}>Kết nối MetaMask</Button>
  }
  const w = me.data?.wallet
  const wrong = chainId != null && chainId !== CHAIN_ID
  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <Button size="sm" variant="destructive" onClick={() => ensureChain().then(refresh).catch((e) => toast.error((e as Error).message))}>
          Sai mạng — chuyển sang {chain.name}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-sm hover:bg-bg-subtle-hover">
            <span className="font-mono tabular-nums">{w ? `${fmtEth(w.balance)} ETH` : '…'}</span>
            <span className="h-4 w-px bg-border" />
            <span className="font-mono text-fg-subtle">{short(current, 6)}</span>
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
          {addrUrl(current) && (
            <DropdownMenuItem onClick={() => window.open(addrUrl(current), '_blank')}><ExternalLink /> Xem trên Etherscan</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => walletStore.disconnect()}><LogOut /> Ngắt kết nối (trên trang này)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
