import { ChangeEvent, useEffect, useState } from 'react'
import { Button, Field, TextInput, Topbar } from '../components/ui'
import { resetAllData } from '../db'
import {
  backupFileName,
  downloadTextFile,
  exportBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  shareBackupFile,
} from '../services/backup'
import { getServerRegistration, getSavedWifi, pairAndSync, saveLocalWifi } from '../services/lanSync'
import { getLocalNetwork } from '../services/wifi'
import type { ServerRegistration } from '../types'

export function BackupScreen() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pairOpen, setPairOpen] = useState(false)
  const [code, setCode] = useState('')
  const [wifiLabel, setWifiLabel] = useState('')
  const [ipv4, setIpv4] = useState<string | null>(null)
  const [server, setServer] = useState<ServerRegistration | undefined>()

  async function refreshServer() {
    setServer(await getServerRegistration())
  }

  useEffect(() => {
    void refreshServer()
  }, [])

  async function generate() {
    setError('')
    setBusy(true)
    try {
      const payload = await exportBackup()
      const filename = backupFileName()
      const content = serializeBackup(payload)
      await downloadTextFile(filename, content)
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
        await downloadTextFile(filename, content)
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

  async function openPairing() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const network = await getLocalNetwork()
      await saveLocalWifi(network.ssid)
      setWifiLabel(network.ssid)
      setIpv4(network.ipv4)
      setCode('')
      setPairOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a rede Wi-Fi')
    } finally {
      setBusy(false)
    }
  }

  async function confirmPair() {
    setError('')
    setBusy(true)
    try {
      const saved = await getSavedWifi()
      const result = await pairAndSync(code, ipv4)
      setPairOpen(false)
      await refreshServer()
      setMessage(
        `Servidor cadastrado na rede ${saved?.ssid || result.registration.ssid}. ` +
          `Backup: ${result.clients} cliente(s) e ${result.ledger} lançamento(s). ` +
          `${result.newProducts} produto(s) novo(s) no celular.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar o servidor')
    } finally {
      setBusy(false)
    }
  }

  async function confirmReset() {
    setError('')
    setBusy(true)
    try {
      await resetAllData()
      setResetOpen(false)
      setServer(undefined)
      setMessage('Configurações restauradas. Todos os dados foram apagados.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar os dados')
    } finally {
      setBusy(false)
    }
  }

  const registered = Boolean(server)

  return (
    <main>
      <Topbar title="Backup e sincronização" backTo="/menu" />
      <p className={`server-status ${registered ? 'is-on' : 'is-off'}`}>
        {registered ? 'Servidor cadastrado' : 'Nenhum servidor cadastrado'}
      </p>
      {registered ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Rede {server?.ssid} · {server?.baseUrl}
        </p>
      ) : null}

      {!registered ? (
        <section className="card stack">
          <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>Servidor na rede</h2>
          <p className="muted">
            Cadastre o computador da mesma Wi-Fi para enviar clientes e lançamentos e receber
            produtos que ainda não estão neste celular.
          </p>
          <Button variant="primary" onClick={() => void openPairing()} disabled={busy}>
            Cadastrar servidor
          </Button>
        </section>
      ) : null}

      <section className="card stack" style={{ marginTop: 14 }}>
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>
          Exportar dados (backup)
        </h2>
        <p className="muted">
          Gera um arquivo JSON com clientes, produtos, lançamentos e pagamentos para guardar no
          aparelho ou enviar a outro celular.
        </p>
        <Button variant="primary" onClick={() => void generate()} disabled={busy}>
          Gerar backup local
        </Button>
        <Button variant="ghost" onClick={() => void share()} disabled={busy}>
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
          <input type="file" accept="application/json,.json" onChange={(event) => void onFile(event)} />
        </label>
      </section>
      <section className="card stack" style={{ marginTop: 14, borderColor: 'rgba(198, 40, 40, 0.35)' }}>
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem', color: '#c62828' }}>
          Restaurar configurações
        </h2>
        <p className="muted">
          Apaga clientes, produtos, vendas, pagamentos e perfil deste aparelho e volta ao estado
          inicial.
        </p>
        <Button variant="danger" onClick={() => setResetOpen(true)} disabled={busy}>
          Restaurar configurações
        </Button>
      </section>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {pairOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pair-title">
          <div className="modal">
            <h2 id="pair-title" style={{ fontFamily: 'var(--serif)', marginTop: 0 }}>
              Cadastrar servidor
            </h2>
            <p className="muted">Rede Wi-Fi salva: {wifiLabel || 'Wi-Fi local'}</p>
            <Field label="Código do servidor">
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <p className="hint">Use o código de 6 dígitos exibido no computador.</p>
            <div className="stack" style={{ marginTop: 12 }}>
              <Button variant="primary" onClick={() => void confirmPair()} disabled={busy || code.length !== 6}>
                Confirmar código
              </Button>
              <Button variant="ghost" onClick={() => setPairOpen(false)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {resetOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="modal">
            <h2 id="reset-title" style={{ fontFamily: 'var(--serif)', marginTop: 0, color: '#c62828' }}>
              Atenção
            </h2>
            <p>
              Faça um <strong>backup agora</strong>, se ainda precisar dos dados. Depois desta
              confirmação, clientes, produtos, vendas e pagamentos serão apagados.
            </p>
            <p className="error">
              Esta ação não pode ser desfeita. Sem um arquivo de backup, não há como restaurar as
              informações.
            </p>
            <div className="stack">
              <Button variant="danger" onClick={() => void confirmReset()} disabled={busy}>
                Apagar todos os dados
              </Button>
              <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
