import { ChangeEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextInput, Topbar } from '../components/ui'
import { CLOUD_API_URL } from '../config'
import { getOrCreateProfile, resetAllData } from '../db'
import { isValidEmail, normalizeEmail, setUnlocked } from '../auth'
import {
  backupFileName,
  downloadTextFile,
  exportBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  shareBackupFile,
} from '../services/backup'
import {
  describeSync,
  fetchDeviceStatus,
  forgetServer,
  getAllowMobileData,
  getServerRegistration,
  pairAndSync,
  setAllowMobileData,
  syncAllowedOnCurrentNetwork,
  syncNow,
} from '../services/lanSync'
import type { ServerRegistration } from '../types'

export function BackupScreen() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pairOpen, setPairOpen] = useState(false)
  const [code, setCode] = useState('')
  const [server, setServer] = useState<ServerRegistration | undefined>()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [allowMobile, setAllowMobile] = useState(false)

  async function refreshServer() {
    const [registration, profile, status, mobile] = await Promise.all([
      getServerRegistration(),
      getOrCreateProfile(),
      fetchDeviceStatus(),
      getAllowMobileData(),
    ])
    setServer(registration)
    setUserEmail(normalizeEmail(profile.email))
    setAllowMobile(mobile)
    if (status) setEnabled(status.enabled)
    else setEnabled(registration ? null : false)
    return status
  }

  useEffect(() => {
    void refreshServer()
  }, [])

  useEffect(() => {
    if (!server || enabled !== false) return
    const timer = window.setInterval(() => {
      void (async () => {
        const status = await fetchDeviceStatus()
        if (!status) return
        if (status.passwordReset) {
          navigate('/cadastro', { replace: true })
          return
        }
        if (status.enabled) {
          setEnabled(true)
          const network = await syncAllowedOnCurrentNetwork()
          if (!network.ok) {
            setMessage('Liberado pelo admin. A sincronização espera o Wi-Fi (ou permita dados móveis abaixo).')
            return
          }
          setBusy(true)
          try {
            const result = await syncNow()
            if (result.passwordReset) {
              navigate('/cadastro', { replace: true })
              return
            }
            setMessage(`Liberado pelo admin. ${describeSync(result)}`)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao sincronizar após a liberação')
          } finally {
            setBusy(false)
          }
        }
      })()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [server, enabled, navigate])

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

  async function confirmPair() {
    setError('')
    if (!isValidEmail(userEmail)) {
      setError('Conclua o cadastro com um e-mail válido. Ele identifica o usuário para o admin.')
      return
    }
    setBusy(true)
    try {
      const result = await pairAndSync(code)
      setPairOpen(false)
      setCode('')
      await refreshServer()
      if (result.passwordReset) {
        navigate('/cadastro', { replace: true })
        return
      }
      if (result.pending) {
        setEnabled(false)
        setMessage(
          `Nuvem cadastrada para ${userEmail}. O admin precisa liberar este e-mail antes do sincronismo.`,
        )
        return
      }
      if (result.deferred) {
        setEnabled(true)
        setMessage(
          `Nuvem cadastrada e liberada. A sincronização espera o Wi-Fi (ou permita dados móveis nesta tela).`,
        )
        return
      }
      setEnabled(true)
      setMessage(`Nuvem cadastrada e liberada. ${describeSync(result)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar a nuvem')
    } finally {
      setBusy(false)
    }
  }

  async function confirmSync() {
    setError('')
    setBusy(true)
    try {
      const result = await syncNow()
      if (result.passwordReset) {
        navigate('/cadastro', { replace: true })
        return
      }
      setEnabled(true)
      setMessage(describeSync(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sincronizar')
    } finally {
      setBusy(false)
    }
  }

  async function changeSyncNetwork(allow: boolean) {
    setAllowMobile(allow)
    setError('')
    try {
      await setAllowMobileData(allow)
      setMessage(
        allow
          ? 'Sincronização permitida no Wi-Fi e nos dados móveis.'
          : 'Sincronização só no Wi-Fi. Fora da rede, o aplicativo continua com os dados deste aparelho.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a preferência de rede')
    }
  }

  async function confirmForget() {
    setError('')
    setBusy(true)
    try {
      await forgetServer()
      await refreshServer()
      setEnabled(false)
      setMessage('Celular desconectado da nuvem. Os dados locais foram mantidos.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desconectar')
    } finally {
      setBusy(false)
    }
  }

  async function confirmReset() {
    setError('')
    setBusy(true)
    try {
      await resetAllData()
      setServer(undefined)
      setEnabled(false)
      setUnlocked(false)
      setResetOpen(false)
      navigate('/cadastro', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar os dados')
    } finally {
      setBusy(false)
    }
  }

  const registered = Boolean(server)
  const pending = registered && enabled === false

  return (
    <main>
      <Topbar title="Backup e sincronização" backTo="/menu" />
      <p className={`server-status ${registered && enabled ? 'is-on' : registered ? 'is-off' : 'is-off'}`}>
        {!registered
          ? 'Nenhuma nuvem cadastrada'
          : pending
            ? 'Aguardando liberação do admin'
            : enabled
              ? 'Nuvem liberada'
              : 'Nuvem cadastrada'}
      </p>
      {userEmail ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Usuário do aplicativo: {userEmail}
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          Sem e-mail no cadastro. O admin identifica o usuário pelo e-mail.
        </p>
      )}
      {registered ? (
        <p className="muted" style={{ marginTop: 0 }}>
          HTTPS/JSON · {server?.baseUrl}
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          API {CLOUD_API_URL}
        </p>
      )}

      <section className="card stack">
        <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>Rede para sincronizar</h2>
        <p className="muted">
          Clientes, produtos e lançamentos ficam neste aparelho mesmo sem internet. A nuvem só é
          usada na rede que você escolher.
        </p>
        <div className="choice-list" role="radiogroup" aria-label="Rede para sincronizar">
          <label className={`choice ${!allowMobile ? 'is-on' : ''}`}>
            <input
              type="radio"
              name="sync-network"
              checked={!allowMobile}
              onChange={() => void changeSyncNetwork(false)}
            />
            <span>
              Somente Wi-Fi
              <small>Não usa o pacote de dados móveis</small>
            </span>
          </label>
          <label className={`choice ${allowMobile ? 'is-on' : ''}`}>
            <input
              type="radio"
              name="sync-network"
              checked={allowMobile}
              onChange={() => void changeSyncNetwork(true)}
            />
            <span>
              Wi-Fi e dados móveis
              <small>Sincroniza também pelo 4G/5G</small>
            </span>
          </label>
        </div>
      </section>

      {!registered ? (
        <section className="card stack" style={{ marginTop: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>Servidor na nuvem</h2>
          <p className="muted">
            Cadastre este celular na API. O admin libera o e-mail manualmente. Só então o aplicativo
            sincroniza: o catálogo de produtos é comum; clientes e lançamentos são só deste usuário.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setError('')
              setMessage('')
              setCode('')
              setPairOpen(true)
            }}
            disabled={busy}
          >
            Cadastrar nuvem
          </Button>
        </section>
      ) : (
        <section className="card stack" style={{ marginTop: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', margin: 0, fontSize: '1.15rem' }}>Sincronização</h2>
          {pending ? (
            <p className="muted">
              Este e-mail está na fila do admin. Depois da liberação, o aplicativo envia e recebe
              clientes, produtos e lançamentos automaticamente.
            </p>
          ) : (
          <p className="muted">
            O catálogo de produtos é comum a todos os usuários e ao admin. Clientes, vendas e
            pagamentos ficam só neste e-mail.
          </p>
          )}
          <Button variant="primary" onClick={() => void confirmSync()} disabled={busy || pending}>
            Sincronizar agora
          </Button>
          <Button variant="ghost" onClick={() => void confirmForget()} disabled={busy}>
            Desconectar nuvem
          </Button>
        </section>
      )}

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
              Cadastrar nuvem
            </h2>
            <p className="muted">
              Use o código de 6 dígitos da página do admin. O e-mail {userEmail || 'deste cadastro'}{' '}
              identifica o usuário. A sincronização só começa depois da liberação manual.
            </p>
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
            <p className="hint">A comunicação é HTTPS com JSON. Não precisa da mesma Wi-Fi.</p>
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
