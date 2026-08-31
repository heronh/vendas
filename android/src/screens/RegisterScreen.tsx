import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextInput } from '../components/ui'
import {
  DEFAULT_PASSWORD,
  isDefaultPassword,
  isUnlocked,
  isValidEmail,
  normalizeEmail,
  setPassword,
  setUnlocked,
} from '../auth'
import { db, getOrCreateProfile } from '../db'
import { notifyPasswordChanged } from '../services/lanSync'

export function RegisterScreen() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function gate() {
      const def = await isDefaultPassword()
      if (cancelled) return
      if (!def) {
        navigate(isUnlocked() ? '/menu' : '/', { replace: true })
        return
      }
      const profile = await getOrCreateProfile()
      if (cancelled) return
      setDisplayName(profile.displayName)
      setEmail(profile.email)
      setPhone(profile.phone)
      setReady(true)
    }
    void gate()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const name = displayName.trim()
    const mail = normalizeEmail(email)
    if (!name) {
      setError('Informe o nome.')
      return
    }
    if (!isValidEmail(mail)) {
      setError('Informe um e-mail válido. Ele identifica o usuário deste aplicativo.')
      return
    }
    if (password !== confirm) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password === DEFAULT_PASSWORD) {
      setError('Não use 000000. Escolha outra senha. A senha do admin no host é outra.')
      return
    }
    setBusy(true)
    try {
      const profile = await getOrCreateProfile()
      await db.profile.put({
        ...profile,
        displayName: name,
        email: mail,
        phone: phone.trim(),
        company: profile.company.trim() || 'Beauty Brasil SJC',
        updatedAt: Date.now(),
      })
      await setPassword(password)
      await notifyPasswordChanged()
      setUnlocked(true)
      navigate('/menu', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <main>
      <header className="topbar">
        <span style={{ width: 42 }} />
        <h1>Cadastro de usuário</h1>
        <span style={{ width: 42 }} />
      </header>
      <p className="callout-warn" role="alert">
        A senha <strong>000000</strong> é só o primeiro acesso deste celular. Cadastre o usuário do
        aplicativo. O e-mail é o identificador. A senha do <strong>admin</strong> no host é outra e
        não abre este aparelho.
      </p>
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Nome">
          <TextInput
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </Field>
        <Field label="E-mail">
          <TextInput
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="Telefone">
          <TextInput
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field label="Senha do aplicativo">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setValue(event.target.value)}
            required
            minLength={6}
          />
        </Field>
        <Field label="Confirmar senha">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            minLength={6}
          />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        <Button variant="primary" type="submit" disabled={busy}>
          Concluir cadastro
        </Button>
      </form>
    </main>
  )
}
