import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { isDemo } from '../demo'

type SyncNotice = { ok: boolean; text: string }

export function Layout() {
  const [notice, setNotice] = useState<SyncNotice | null>(null)

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<SyncNotice>).detail
      if (!detail?.text) return
      setNotice(detail)
    }
    window.addEventListener('vendas-sync', onSync)
    return () => window.removeEventListener('vendas-sync', onSync)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <div className="app-shell">
      <div className="watermark" aria-hidden />
      {isDemo ? (
        <p className="sync-banner is-demo" role="status">
          Os dados desta demonstração ficam neste navegador.
        </p>
      ) : null}
      {notice ? (
        <p className={`sync-banner ${notice.ok ? 'is-ok' : 'is-err'}`} role="status">
          {notice.text}
        </p>
      ) : null}
      <Outlet />
    </div>
  )
}
