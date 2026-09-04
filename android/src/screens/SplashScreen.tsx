import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkCloudPasswordReset, connectAndSync } from '../services/lanSync'
import { confirmPasswordReset, requestPasswordReset } from '../services/appMode'
import { Button, Field, TextInput } from '../components/ui'
import { DEFAULT_PASSWORD, checkPassword, isDefaultPassword, isUnlocked, isValidEmail, normalizeEmail, setPassword, setUnlocked } from '../auth'
import { getOrCreateProfile } from '../db'

export function SplashScreen() {
  const navigate = useNavigate()
  const [password, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [resetPhase, setResetPhase] = useState<'ask' | 'confirm'>('ask')

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
        try {
          await connectAndSync()
        } catch {
          /* segue ao menu mesmo se a nuvem falhar; o erro aparece abaixo se ainda estiver nesta tela */
        }
        if (cancelled) return
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
      try {
        await connectAndSync()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao conectar ao banco')
      }
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
      {!ready ? (
        <p className="muted" style={{ marginTop: 'auto' }}>
          Abrindo…
        </p>
      ) : forgot ? (
        <form
          className="splash-actions splash-login"
          onSubmit={(event) => {
            event.preventDefault()
            void (async () => {
              setError('')
              setBusy(true)
              try {
                const mail = normalizeEmail(email)
                if (!isValidEmail(mail)) {
                  setError('Informe o e-mail cadastrado.')
                  return
                }
                if (resetPhase === 'ask') {
                  await requestPasswordReset(mail)
                  setResetPhase('confirm')
                  return
                }
                await confirmPasswordReset(mail, tempPassword)
                setUnlocked(true)
                navigate('/menu', { replace: true })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Falha no reset')
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          <Field label="E-mail cadastrado">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {resetPhase === 'confirm' ? (
            <Field label="Senha recebida no e-mail">
              <TextInput type="password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required />
            </Field>
          ) : (
            <p className="muted">Enviamos uma senha temporária ao e-mail cadastrado. Precisa de internet neste passo.</p>
          )}
          {error ? <p className="error">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={busy}>
            {resetPhase === 'ask' ? 'Enviar senha' : 'Entrar com a nova senha'}
          </Button>
          <Button variant="ghost" type="button" disabled={busy} onClick={() => setForgot(false)}>
            Voltar
          </Button>
        </form>
      ) : (
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
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setForgot(true)
              void getOrCreateProfile().then((p) => setEmail(p.email))
            }}
          >
            Esqueci a senha
          </Button>
        </form>
      )}
    </main>
  )
}
