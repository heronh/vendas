import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkCloudPasswordReset } from '../services/lanSync'
import { Button, Field, TextInput } from '../components/ui'
import { DEFAULT_PASSWORD, checkPassword, isDefaultPassword, isUnlocked, setPassword, setUnlocked } from '../auth'

export function SplashScreen() {
  const navigate = useNavigate()
  const [password, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const reset = await checkCloudPasswordReset()
      if (cancelled) return
      if (reset) {
        await setPassword(DEFAULT_PASSWORD)
        setUnlocked(false)
        navigate('/cadastro', { replace: true })
        return
      }
      const def = await isDefaultPassword()
      if (cancelled) return
      if (def) {
        navigate('/cadastro', { replace: true })
        return
      }
      if (isUnlocked()) {
        navigate('/menu', { replace: true })
        return
      }
      setReady(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const reset = await checkCloudPasswordReset()
      if (reset || password === DEFAULT_PASSWORD) {
        const ok = reset || (await checkPassword(password))
        if (!ok) {
          setError('Senha inválida.')
          return
        }
        await setPassword(DEFAULT_PASSWORD)
        setUnlocked(false)
        navigate('/cadastro', { replace: true })
        return
      }
      const ok = await checkPassword(password)
      if (!ok) {
        setError('Senha inválida.')
        return
      }
      setUnlocked(true)
      navigate('/menu', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="splash">
      <div className="splash-kicker">Beauty Brasil SJC</div>
      <img className="splash-logo" src="/logo.jpeg" alt="Logo Beauty Brasil" />
      <h1>Controle de Vendas</h1>
      <p>Gestão Offline</p>
      <p className="muted">Estética e bem-estar · São José dos Campos</p>
      {ready ? (
        <form className="splash-actions splash-login" onSubmit={(event) => void onSubmit(event)}>
          <Field label="Senha do aplicativo">
            <TextInput
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </Field>
          {error ? <p className="error">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={busy}>
            Entrar
          </Button>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: 'auto' }}>
          Abrindo…
        </p>
      )}
    </main>
  )
}
