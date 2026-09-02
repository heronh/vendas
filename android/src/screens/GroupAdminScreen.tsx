import { useEffect, useState } from 'react'
import { Button, Topbar } from '../components/ui'
import { excludeMember, fetchMembers, getAppMode } from '../services/appMode'

export function GroupAdminScreen() {
  const [members, setMembers] = useState<Array<{ id: string; email: string; displayName: string; role: string }>>([])
  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const mode = await getAppMode()
    setSignature(mode?.signature || '')
    setMembers(await fetchMembers())
  }

  useEffect(() => {
    void load()
  }, [])

  async function kick(id: string) {
    setBusy(true)
    setError('')
    try {
      await excludeMember(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <Topbar title="Administração do grupo" backTo="/menu" />
      {signature ? (
        <p className="ok">
          Assinatura da empresa: <strong>{signature}</strong>
        </p>
      ) : null}
      <p className="muted">Excluir um membro o coloca em stand alone e solicita a cobrança da licença. O catálogo de produtos continua compartilhado entre quem restar.</p>
      <ul className="menu-list">
        {members.map((m) => (
          <li key={m.id} className="card" style={{ marginBottom: 8, listStyle: 'none' }}>
            <strong>{m.displayName || m.email}</strong>
            <p className="muted" style={{ margin: '4px 0 8px' }}>
              {m.email} · {m.role === 'owner' ? 'dono' : 'membro'}
            </p>
            {m.role !== 'owner' ? (
              <Button variant="danger" disabled={busy} onClick={() => void kick(m.id)}>
                Excluir do grupo
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
