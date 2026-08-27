import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, Topbar } from '../components/ui'
import { clientBalanceCents, db, newId } from '../db'
import {
  formatBRL,
  formatDateTime,
  fromDatetimeLocalValue,
  parseMoneyToCents,
  toDatetimeLocalValue,
} from '../format'
import type { Client, LedgerEntry, Payment, Sale } from '../types'

export function AccountScreen() {
  const { id } = useParams()
  const [client, setClient] = useState<Client | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openPay, setOpenPay] = useState(false)
  const [amount, setAmount] = useState('')
  const [when, setWhen] = useState(toDatetimeLocalValue(Date.now()))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    if (!id) return
    const [found, saleRows, payRows, due] = await Promise.all([
      db.clients.get(id),
      db.sales.where('clientId').equals(id).toArray(),
      db.payments.where('clientId').equals(id).toArray(),
      clientBalanceCents(id),
    ])
    setClient(found ?? null)
    setSales(saleRows)
    setPayments(payRows)
    setBalance(due)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [id])

  const ledger: LedgerEntry[] = useMemo(() => {
    const salesEntries: LedgerEntry[] = sales.map((sale) => ({
      id: sale.id,
      kind: 'sale',
      occurredAt: sale.occurredAt,
      amountCents: sale.totalCents,
      title: sale.productDescription,
      detail: `${sale.quantity} un. × ${formatBRL(sale.unitPriceCents)}`,
    }))
    const payEntries: LedgerEntry[] = payments.map((payment) => ({
      id: payment.id,
      kind: 'payment',
      occurredAt: payment.occurredAt,
      amountCents: payment.amountCents,
      title: 'Pagamento / abate',
      detail: payment.notes,
    }))
    return [...salesEntries, ...payEntries].sort((a, b) => b.occurredAt - a.occurredAt)
  }, [sales, payments])

  async function onPay(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    const cents = parseMoneyToCents(amount)
    if (cents <= 0) {
      setError('Informe um valor de pagamento')
      return
    }
    await db.payments.add({
      id: newId(),
      clientId: id,
      amountCents: cents,
      occurredAt: fromDatetimeLocalValue(when),
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    })
    setAmount('')
    setNotes('')
    setWhen(toDatetimeLocalValue(Date.now()))
    setOpenPay(false)
    setError('')
    await reload()
  }

  if (loading) {
    return (
      <main>
        <Topbar title="Conta corrente" backTo="/clientes" />
        <p className="muted">Carregando…</p>
      </main>
    )
  }

  if (!client) {
    return (
      <main>
        <Topbar title="Conta corrente" backTo="/clientes" />
        <p className="error">Cliente não encontrado.</p>
      </main>
    )
  }

  return (
    <main>
      <Topbar title={`Conta corrente`} backTo="/clientes" />
      <p className="muted" style={{ marginTop: 0 }}>
        {client.fullName}
      </p>
      <section className="hero-balance">
        <small>Saldo devedor atual</small>
        <strong>{formatBRL(balance)}</strong>
      </section>
      <div className="stack">
        <Link to={`/clientes/${client.id}/lancamentos`}>
          <Button variant="ghost">Registrar venda</Button>
        </Link>
        <Button variant="navy" onClick={() => setOpenPay((value) => !value)}>
          + Registrar pagamento / abate
        </Button>
      </div>
      {openPay ? (
        <form className="card stack" style={{ marginTop: 12 }} onSubmit={onPay}>
          <Field label="Valor">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
          <Field label="Data do recebimento">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Observação">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit">
            Salvar pagamento
          </button>
        </form>
      ) : null}
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem', margin: '22px 0 10px' }}>
        Histórico
      </h2>
      {ledger.length === 0 ? (
        <EmptyState title="Nenhum lançamento ainda">
          Vendas e pagamentos aparecerão aqui, do mais recente ao mais antigo.
        </EmptyState>
      ) : (
        <div className="history">
          {ledger.map((entry) => (
            <article key={`${entry.kind}-${entry.id}`} className="history-item">
              <div>
                <span className={`badge ${entry.kind === 'sale' ? 'badge-sale' : 'badge-pay'}`}>
                  {entry.kind === 'sale' ? '(+) Venda' : '(-) Pagamento'}
                </span>
                <div style={{ marginTop: 6 }}>{entry.title}</div>
                <div className="muted">
                  {formatDateTime(entry.occurredAt)}
                  {entry.detail ? ` · ${entry.detail}` : ''}
                </div>
              </div>
              <strong>
                {entry.kind === 'sale' ? '+' : '−'}
                {formatBRL(entry.amountCents)}
              </strong>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
