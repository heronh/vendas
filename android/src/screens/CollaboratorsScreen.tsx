import { FormEvent, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Field, TextInput, Topbar } from '../components/ui'
import {
  createCollaborator,
  getDemoSession,
  listCollaborators,
  setCollaboratorBlocked,
} from '../services/demoUsers'
import type { DemoUser } from '../types'

export function CollaboratorsScreen() {
  const session = getDemoSession()
  const [rows, setRows] = useState<DemoUser[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    setRows(await listCollaborators())
  }

  useEffect(() => {
    void reload()
  }, [])

  if (!session || session.role !== 'admin') {
    return <Navigate to="/menu" replace />
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await createCollaborator(username, password)
      setUsername('')
      setPassword('')
      setMessage('Colaborador criado.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(user: DemoUser) {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await setCollaboratorBlocked(user.id, !user.blocked)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <Topbar title="Colaboradores" backTo="/menu" />
      <form className="card stack" onSubmit={(event) => void onCreate(event)}>
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>Novo colaborador</h2>
        <Field label="Usuário">
          <TextInput
            autoComplete="off"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </Field>
        <Field label="Senha">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        <Button variant="primary" type="submit" disabled={busy}>
          Criar colaborador
        </Button>
      </form>
      <section className="stack" style={{ marginTop: 14 }}>
        {rows.map((user) => (
          <article key={user.id} className="card stack">
            <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>{user.displayName}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {user.blocked ? 'Bloqueado' : 'Ativo'}
              {user.fixed ? ' · conta de teste' : ''}
            </p>
            <Button variant={user.blocked ? 'navy' : 'danger'} disabled={busy} onClick={() => void toggle(user)}>
              {user.blocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
          </article>
        ))}
      </section>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
