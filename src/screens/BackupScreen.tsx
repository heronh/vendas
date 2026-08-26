import { ChangeEvent, useState } from 'react'
import { Button, Topbar } from '../components/ui'
import {
  backupFileName,
  downloadTextFile,
  exportBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  shareBackupFile,
} from '../services/backup'

export function BackupScreen() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate() {
    setError('')
    setBusy(true)
    try {
      const payload = await exportBackup()
      const filename = backupFileName()
      const content = serializeBackup(payload)
      downloadTextFile(filename, content)
      setMessage(`Backup salvo: ${filename}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar backup')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    setError('')
    setBusy(true)
    try {
      const payload = await exportBackup()
      const filename = backupFileName()
      const content = serializeBackup(payload)
      const shared = await shareBackupFile(filename, content)
      if (!shared) {
        downloadTextFile(filename, content)
        setMessage('Compartilhamento indisponível neste aparelho. O arquivo foi baixado.')
      } else {
        setMessage('Backup pronto para envio')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao compartilhar')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const confirmed = window.confirm(
      'A restauração substitui todos os clientes, produtos, vendas e pagamentos atuais. Continuar?',
    )
    if (!confirmed) return
    setError('')
    setBusy(true)
    try {
      const raw = await file.text()
      const payload = parseBackup(raw)
      await restoreBackup(payload)
      setMessage('Base restaurada com sucesso')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arquivo inválido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <Topbar title="Backup e Restauração" backTo="/menu" />
      <section className="card stack">
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>
          Exportar dados (backup)
        </h2>
        <p className="muted">
          Gera um arquivo JSON com clientes, produtos, lançamentos e pagamentos para guardar no
          aparelho ou enviar a outro celular.
        </p>
        <Button variant="primary" onClick={generate} disabled={busy}>
          Gerar backup local
        </Button>
        <Button variant="ghost" onClick={share} disabled={busy}>
          Compartilhar backup
        </Button>
      </section>
      <section className="card stack" style={{ marginTop: 14 }}>
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>
          Importar dados (restaurar)
        </h2>
        <p className="muted">
          Selecione um arquivo de backup gerado por este aplicativo para restaurar as informações.
        </p>
        <label className="btn btn-navy file-btn">
          Selecionar arquivo
          <input type="file" accept="application/json,.json" onChange={onFile} />
        </label>
      </section>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
