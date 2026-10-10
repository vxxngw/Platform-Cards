import { useEffect } from 'react'
import { ChevronDown, Copy, Droplets, ExternalLink, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fmtEth, fmtUsd, short, useWalletStore } from '@/lib/tc'
import { useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { CHAIN_ID, addrUrl } from '@/lib/chain/config'
import { chain } from '@/lib/chain/client'
import { connectWallet, disconnectWallet, ensureChain, initChainWallet, useWalletChainId } from '@/lib/chain/wallet'

// The local chain has no web faucet: contracts/scripts/fund.js sends ETH from a pre-funded dev account.
const faucetCommand = (addr: string) => `npm run fund -- ${addr}`

export function ChainWalletMenu() {
  const { current } = useWalletStore()
  const chainId = useWalletChainId()
  const me = useMe()
  const refresh = useRefresh()
  const ethUsd = useEthUsd()
  useEffect(() => { initChainWallet() }, [])

  if (!current) {
    return <Button size="sm" onClick={() => connectWallet().then(refresh).catch(() => {})}>Connect wallet</Button>
  }
  const w = me.data?.wallet
  const wrong = chainId != null && chainId !== CHAIN_ID
  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <Button size="sm" variant="destructive" onClick={() => ensureChain().then(refresh).catch((e) => toast.error((e as Error).message))}>
          Wrong network — switch to {chain.name}
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
              <button className="text-fg-muted hover:text-fg-base" onClick={() => { navigator.clipboard?.writeText(current); toast('Address copied') }}><Copy className="size-3.5" /></button>
            </div>
            <div className="text-xs font-normal text-fg-muted">MetaMask · {chain.name}</div>
            {w && <div className="text-xs font-normal text-fg-muted">{fmtEth(w.balance, 6)} ETH {ethUsd ? `≈ ${fmtUsd(Number(w.balance) * ethUsd)}` : ''}</div>}
          </DropdownMenuLabel>
          {addrUrl(current) && (
            <DropdownMenuItem onClick={() => window.open(addrUrl(current), '_blank')}><ExternalLink /> View in explorer</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(faucetCommand(current)); toast('Faucet command copied', { description: `Run it in contracts/ to send 100 local ETH: ${faucetCommand(current)}` }) }}>
            <Droplets /> Get local ETH (copy faucet command)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => disconnectWallet().then(refresh).catch(() => {})}><LogOut /> Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
