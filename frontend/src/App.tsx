import { Toaster } from 'sonner'
import { Shell } from '@/components/tc/Shell'
import { useRoute } from '@/lib/router'
import Home from '@/pages/Home'
import SetDetail from '@/pages/SetDetail'
import OpenPacks from '@/pages/OpenPacks'
import Collection from '@/pages/Collection'
import Market from '@/pages/Market'
import Admin from '@/pages/Admin'
import PackBuilder from '@/pages/PackBuilder'

export default function App() {
  const route = useRoute()
  const [path, query = ''] = route.split('?')
  const params = new URLSearchParams(query)
  const setMatch = path.match(/^\/sets\/(\d+)/)

  let page
  if (setMatch) page = <SetDetail key={setMatch[1]} id={Number(setMatch[1])} />
  else if (path === '/open') page = <OpenPacks />
  else if (path === '/collection') page = <Collection />
  else if (path === '/market') page = <Market key={query} initialSet={params.get('set') || undefined} />
  else if (path === '/admin/pack-builder') page = <PackBuilder />
  else if (path === '/admin') page = <Admin />
  else page = <Home />

  return (
    <>
      <Shell path={path}>{page}</Shell>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  )
}
