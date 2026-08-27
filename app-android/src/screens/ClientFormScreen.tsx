import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Field, Topbar } from '../components/ui'
import { db, newId } from '../db'
import { formatCep } from '../format'
import { lookupCep } from '../services/cep'
import type { Client } from '../types'

const empty: Omit<Client, 'id' | 'createdAt' | 'updatedAt'> = {
  fullName: '',
  tradeName: '',
  company: '',
  phone: '',
  email: '',
  cep: '',
  street: '',
  neighborhood: '',
  city: '',
  state: '',
  number: '',
  complement: '',
}

export function ClientFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    db.clients.get(id).then((client) => {
      if (!client) {
        setError('Cliente não encontrado')
        return
      }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = client
      setForm(rest)
    })
  }, [id])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function searchCep() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const address = await lookupCep(form.cep)
      setForm((current) => ({
        ...current,
        street: address.street || current.street,
        neighborhood: address.neighborhood || current.neighborhood,
        city: address.city,
        state: address.state,
      }))
      setMessage('Endereço preenchido pelo ViaCEP')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar CEP')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.fullName.trim()) {
      setError('Informe o nome completo')
      return
    }
    const now = Date.now()
    if (editing && id) {
      const current = await db.clients.get(id)
      if (!current) {
        setError('Cliente não encontrado')
        return
      }
      await db.clients.put({ ...current, ...form, updatedAt: now })
    } else {
      await db.clients.add({
        ...form,
        id: newId(),
        createdAt: now,
        updatedAt: now,
      })
    }
    navigate('/clientes')
  }

  return (
    <main>
      <Topbar title={editing ? 'Editar Cliente' : 'Cadastro de Cliente'} backTo="/menu" />
      <form className="stack" onSubmit={onSubmit}>
        <Field label="Nome completo">
          <input
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            required
          />
        </Field>
        <Field label="Nome fantasia / resumido">
          <input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} />
        </Field>
        <Field label="Empresa">
          <input value={form.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Telefone">
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              inputMode="tel"
            />
          </Field>
          <Field label="E-mail">
            <input
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              type="email"
            />
          </Field>
        </div>
        <div className="cep-row">
          <Field label="CEP">
            <input
              value={form.cep}
              onChange={(e) => set('cep', formatCep(e.target.value))}
              inputMode="numeric"
              placeholder="00000-000"
            />
          </Field>
          <Button variant="navy" block={false} onClick={searchCep} disabled={busy}>
            {busy ? '...' : 'Buscar CEP'}
          </Button>
        </div>
        <Field label="Endereço">
          <input value={form.street} onChange={(e) => set('street', e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Número">
            <input value={form.number} onChange={(e) => set('number', e.target.value)} />
          </Field>
          <Field label="Bairro">
            <input
              value={form.neighborhood}
              onChange={(e) => set('neighborhood', e.target.value)}
            />
          </Field>
        </div>
        <div className="row">
          <Field label="Cidade">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="UF">
            <input
              value={form.state}
              onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
            />
          </Field>
        </div>
        <Field label="Complemento">
          <input value={form.complement} onChange={(e) => set('complement', e.target.value)} />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
        <button className="btn btn-primary" type="submit">
          Salvar cadastro
        </button>
      </form>
    </main>
  )
}
