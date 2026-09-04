import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextInput } from '../components/ui'
import {
  chooseConnected,
  chooseStandalone,
  createCompany,
  joinCompany,
} from '../services/appMode'

type Step = 'pick' | 'company' | 'join'

export function ModeScreen() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [signature, setSignature] = useState('')
  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [state, setUf] = useState('')
  const [createdSig, setCreatedSig] = useState('')

  async function goStandalone() {
    setBusy(true)
    setError('')
    try {
      await chooseStandalone()
      navigate('/cobranca', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gravar o modo')
    } finally {
      setBusy(false)
    }
  }

  async function goConnected() {
    setBusy(true)
    setError('')
    try {
      await chooseConnected()
      navigate('/cobranca', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar')
    } finally {
      setBusy(false)
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await createCompany({ legalName, tradeName, cnpj, email, phone, city, state })
      setCreatedSig(data.signature || '')
      navigate('/menu', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar a empresa')
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await joinCompany(signature)
      navigate('/menu', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assinatura inválida')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <header className="topbar">
        <span style={{ width: 42 }} />
        <h1>Como vai usar</h1>
        <span style={{ width: 42 }} />
      </header>
      {step === 'pick' ? (
        <div className="stack">
          <p className="muted">Escolha o modo deste aparelho. Dá para mudar depois só com um novo cadastro.</p>
          <Button variant="primary" disabled={busy} onClick={() => void goStandalone()}>
            Stand alone
          </Button>
          <p className="hint">Sem backup na nuvem. Você exporta e importa arquivos JSON.</p>
          <Button variant="navy" disabled={busy} onClick={() => void goConnected()}>
            Usuário conectado
          </Button>
          <p className="hint">Backup automático na nuvem, só dos seus dados.</p>
          <Button variant="ghost" disabled={busy} onClick={() => setStep('company')}>
            Criar grupo (empresa)
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setStep('join')}>
            Entrar em um grupo
          </Button>
          {createdSig ? <p className="ok">Assinatura da empresa: {createdSig}</p> : null}
        </div>
      ) : null}
      {step === 'company' ? (
        <form className="stack" onSubmit={(event) => void onCreate(event)}>
          <p className="muted">O primeiro usuário cadastra a empresa. A assinatura (6 caracteres) entra nos outros aparelhos.</p>
          <Field label="Razão social">
            <TextInput value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
          </Field>
          <Field label="Nome fantasia">
            <TextInput value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          </Field>
          <Field label="CNPJ">
            <TextInput value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="E-mail da empresa">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Cidade">
            <TextInput value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="UF">
            <TextInput value={state} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
          </Field>
          <Button variant="primary" type="submit" disabled={busy}>
            Cadastrar empresa
          </Button>
          <Button variant="ghost" type="button" disabled={busy} onClick={() => setStep('pick')}>
            Voltar
          </Button>
        </form>
      ) : null}
      {step === 'join' ? (
        <form className="stack" onSubmit={(event) => void onJoin(event)}>
          <Field label="Assinatura (6 caracteres hex)">
            <TextInput
              value={signature}
              onChange={(e) => setSignature(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
              maxLength={6}
              required
            />
          </Field>
          <Button variant="primary" type="submit" disabled={busy || signature.length !== 6}>
            Entrar no grupo
          </Button>
          <Button variant="ghost" type="button" disabled={busy} onClick={() => setStep('pick')}>
            Voltar
          </Button>
        </form>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
