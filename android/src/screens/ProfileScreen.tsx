import { FormEvent, useEffect, useState } from 'react'
import { Button, Field, Topbar } from '../components/ui'
import { db, getOrCreateProfile } from '../db'

export function ProfileScreen() {
  const [displayName, setDisplayName] = useState('')
  const [company, setCompany] = useState('Beauty Brasil SJC')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
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
    await db.profile.put({
      id: 'local',
      displayName: displayName.trim(),
      company: company.trim() || 'Beauty Brasil SJC',
      phone: phone.trim(),
      email: email.trim(),
      updatedAt: Date.now(),
    })
    setSaved(true)
  }

  return (
    <main>
      <Topbar title="Perfil" backTo="/menu" />
      <p className="muted">Dados da profissional ou da clínica neste aparelho.</p>
      <form className="stack" onSubmit={onSubmit}>
        <Field label="Nome">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Empresa">
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="E-mail">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Field>
        {saved ? <p className="ok">Perfil salvo neste aparelho</p> : null}
        <button className="btn btn-primary" type="submit">
          Salvar perfil
        </button>
      </form>
    </main>
  )
}
