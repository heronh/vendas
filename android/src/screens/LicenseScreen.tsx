import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { getAppMode, licenseAllows, refreshAccountStatus } from '../services/appMode'

export function LicenseScreen() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Uso avulso exige regularização da licença. O operador marca como paga na administração do host.')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const mode = await getAppMode()
      if (cancelled) return
      if (licenseAllows(mode)) {
        navigate('/menu', { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function check() {
    setBusy(true)
    try {
      const status = await refreshAccountStatus()
      const mode = await getAppMode()
      if (licenseAllows(mode) || status?.licenseOk) {
        navigate('/menu', { replace: true })
        return
      }
      setMessage('Ainda aguardando a licença. Peça ao operador para marcar como paga.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <header className="topbar">
        <span style={{ width: 42 }} />
        <h1>Cobrança da licença</h1>
        <span style={{ width: 42 }} />
      </header>
      <p className="callout-warn" role="alert">
        {message}
      </p>
      <p className="muted">
        Os dados deste aparelho permanecem aqui. No modo stand alone o backup é só por arquivo. Depois da
        exclusão de um grupo, a licença volta a ser cobrada.
      </p>
      <Button variant="primary" disabled={busy} onClick={() => void check()}>
        Já regularizei, verificar
      </Button>
    </main>
  )
}
