import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextInput } from '../components/ui'
import { chooseStandalone } from '../services/appMode'
import { ensureDemoUsers, getDemoSession, loginDemo } from '../services/demoUsers'

export function DemoLoginScreen() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensureDemoUsers()
        if (cancelled) return
        if (getDemoSession()) {
          await chooseStandalone()
          if (!cancelled) navigate('/menu', { replace: true })
          return
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível abrir')
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await loginDemo(username, password)
      await chooseStandalone()
      navigate('/menu', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="splash">
      <div className="splash-kicker">Beauty Brasil SJC</div>
      <img className="splash-logo" src={`${import.meta.env.BASE_URL}logo.jpeg`} alt="Logo Beauty Brasil" />
      <h1>Controle de Vendas</h1>
      <p>Gestão Offline</p>
      <p className="muted">Estética e bem-estar · São José dos Campos</p>
      {!ready ? (
        <p className="muted" style={{ marginTop: 'auto' }}>
          Abrindo…
        </p>
      ) : (
        <form className="splash-actions splash-login" onSubmit={(event) => void onSubmit(event)}>
          <Field label="Usuário">
            <TextInput
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {error ? <p className="error">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={busy}>
            Entrar
          </Button>
          <p className="demo-accounts">
            mariluci / mariluci · administradora
            <br />
            heron / heron · colaborador
          </p>
        </form>
      )}
    </main>
  )
}
