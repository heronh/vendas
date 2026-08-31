import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isValidEmail, normalizeEmail } from '../auth'
import { Button, Field, Topbar } from '../components/ui'
import { db, getOrCreateProfile } from '../db'

export function ProfileScreen() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [company, setCompany] = useState('Beauty Brasil SJC')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getOrCreateProfile().then((profile) => {
      setDisplayName(profile.displayName)
      setCompany(profile.company)
      setPhone(profile.phone)
      setEmail(profile.email)
    })
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSaved(false)
    const mail = normalizeEmail(email)
    if (!displayName.trim()) {
      setError('Informe o nome.')
      return
    }
    if (!isValidEmail(mail)) {
      setError('O e-mail identifica o usuário deste aplicativo. Informe um e-mail válido.')
      return
    }
    await db.profile.put({
      id: 'local',
      displayName: displayName.trim(),
      company: company.trim() || 'Beauty Brasil SJC',
      phone: phone.trim(),
      email: mail,
      updatedAt: Date.now(),
    })
    setEmail(mail)
    setSaved(true)
  }

  return (
    <main>
      <Topbar title="Perfil" backTo="/menu" />
      <p className="muted">
        Usuário deste aparelho. O e-mail é o identificador perante o admin. A senha daqui não é a
        senha do host.
      </p>
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Nome">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="Empresa">
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="E-mail">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        {saved ? <p className="ok">Perfil salvo neste aparelho</p> : null}
        <button className="btn btn-primary" type="submit">
          Salvar perfil
        </button>
        <Button variant="ghost" onClick={() => navigate('/senha')}>
          Trocar senha
        </Button>
      </form>
    </main>
  )
}
