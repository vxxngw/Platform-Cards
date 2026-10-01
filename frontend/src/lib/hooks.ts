import { useQuery, useQueryClient } from '@tanstack/react-query'
import { http, useWalletStore, type CardSet, type Config, type Me, type CollectionSet, type ChainEvent } from './tc'

export function useMe() {
  const { current } = useWalletStore()
  return useQuery({ queryKey: ['me', current], queryFn: () => http<Me>('tc/me'), enabled: !!current, refetchInterval: 30000 })
}
export function useSets() {
  return useQuery({ queryKey: ['sets'], queryFn: () => http<CardSet[]>('tc/sets') })
}
export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => http<Config>('tc/config') })
}
export function useCollection() {
  const { current } = useWalletStore()
  return useQuery({ queryKey: ['collection', current], queryFn: () => http<CollectionSet[]>('tc/collection'), enabled: !!current })
}
export function useEvents(limit = 20) {
  return useQuery({ queryKey: ['events', limit], queryFn: () => http<ChainEvent[]>(`tc/events?limit=${limit}`), refetchInterval: 30000 })
}
export function useEthUsd() {
  const q = useQuery({
    queryKey: ['eth'],
    queryFn: () => http<{ last: number | null; change24h: number | null }>('eth'),
    refetchInterval: 60000, retry: 1,
  })
  return q.data?.last ?? null
}
export function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}
