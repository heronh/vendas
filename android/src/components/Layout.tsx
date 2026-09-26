import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { isDemo } from '../demo'
import { clearDemoSession } from '../services/demoUsers'

type SyncNotice = { ok: boolean; text: string }

export function Layout() {
  const navigate = useNavigate()
  const [notice, setNotice] = useState<SyncNotice | null>(null)

  function logout() {
    clearDemoSession()
    navigate('/', { replace: true })
  }

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
        <div className="demo-bar">
          <p className="sync-banner is-demo" role="status">
            Os dados desta demonstração ficam neste navegador.
          </p>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sair
          </button>
        </div>
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
