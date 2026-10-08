import { Toaster } from 'sonner'
import { Shell } from '@/components/tc/Shell'
import { WalletProvider } from '@/components/tc/PrivyWallet'
import { useRoute } from '@/lib/router'
import Home from '@/pages/Home'
import Gacha from '@/pages/Gacha'
import GachaDetail from '@/pages/GachaDetail'
import Market from '@/pages/Market'
import Profile, { type ProfileTab } from '@/pages/Profile'
import Admin from '@/pages/Admin'
import PackBuilder from '@/pages/PackBuilder'

const TABS: ProfileTab[] = ['collection', 'packs', 'activity']

export default function App() {
  const route = useRoute()
  const [path, query = ''] = route.split('?')
  const params = new URLSearchParams(query)
  // /gacha/:id, plus the old /sets/:id links
  const setMatch = path.match(/^\/(?:gacha|sets)\/(\d+)/)
  const tab = params.get('tab') as ProfileTab | null

  let page
  if (setMatch) page = <GachaDetail key={setMatch[1]} id={Number(setMatch[1])} />
  else if (path === '/gacha') page = <Gacha />
  else if (path === '/market') page = <Market key={query} initialSet={params.get('set') || undefined} />
  else if (path === '/profile') page = <Profile tab={tab && TABS.includes(tab) ? tab : 'collection'} />
  else if (path === '/open') page = <Profile tab="packs" />
  else if (path === '/collection') page = <Profile tab="collection" />
  else if (path === '/admin/pack-builder') page = <PackBuilder />
  else if (path === '/admin') page = <Admin />
  else page = <Home />

  return (
    <>
      <WalletProvider>
        <Shell path={path}>{page}</Shell>
      </WalletProvider>
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </>
  )
}
