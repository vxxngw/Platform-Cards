import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, Frame } from '@/components/royal/Ornaments'
import { EventRow } from '@/components/royal/Chronicle'
import { http, useWalletStore, type ChainEvent } from '@/lib/tc'

export default function ActivityTab() {
  const { current } = useWalletStore()
  const q = useQuery({ queryKey: ['activity', current], queryFn: () => http<ChainEvent[]>('tc/activity?limit=100'), enabled: !!current, refetchInterval: 30000 })
  if (q.isLoading) return <Skeleton className="h-72 rounded-xl" />
  if (q.error) return <EmptyState title="Your chronicle could not be read" body="Activity could not be loaded from Sepolia right now. Try again shortly." />
  if (!q.data?.length) return <EmptyState title="Nothing recorded yet" body="Purchases, openings, listings and sales from this wallet will be chronicled here." />
  return (
    <Frame corners={false} className="divide-y divide-gold/10 overflow-hidden">
      {q.data.map((e) => <EventRow key={e.id} e={e} me={current} />)}
    </Frame>
  )
}
