import { useEffect, useState, type ReactNode } from 'react'

function readHash() {
  if (typeof window === 'undefined') return '/'
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/'
}

export function useRoute() {
  const [path, setPath] = useState(readHash)
  useEffect(() => {
    const on = () => { setPath(readHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function navigate(path: string) {
  window.location.hash = path
}

export function Link({ to, className, children, onClick }: { to: string; className?: string; children: ReactNode; onClick?: () => void }) {
  return <a href={`#${to}`} className={className} onClick={onClick}>{children}</a>
}
