import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextInput, Topbar } from '../components/ui'
import {
  DEFAULT_PASSWORD,
  isDefaultPassword,
  isUnlocked,
  setPassword,
  setUnlocked,
} from '../auth'
import { notifyPasswordChanged } from '../services/lanSync'

export function ChangePasswordScreen() {
  const navigate = useNavigate()
  const [password, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function gate() {
      const def = await isDefaultPassword()
      if (cancelled) return
      if (def) {
        navigate('/cadastro', { replace: true })
        return
      }
      if (!isUnlocked()) {
        navigate('/', { replace: true })
      }
    }
    void gate()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    if (password.length < 6) {
      setError('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password === DEFAULT_PASSWORD) {
      setError('Não use 000000. Escolha outra senha.')
      return
    }
    setBusy(true)
    try {
      await setPassword(password)
      await notifyPasswordChanged()
      setUnlocked(true)
      navigate('/menu', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a senha')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <Topbar title="Trocar senha" backTo="/perfil" />
      <p className="muted">
        Altera só a senha deste celular. A senha do <strong>admin</strong> no host não muda.
      </p>
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Nova senha">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setValue(event.target.value)}
            required
            minLength={6}
          />
        </Field>
        <Field label="Confirmar nova senha">
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
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Salvar senha
        </button>
      </form>
    </main>
  )
}
