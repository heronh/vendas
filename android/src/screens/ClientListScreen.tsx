import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, Topbar } from '../components/ui'
import { balancesByClient, db } from '../db'
import { formatBRL } from '../format'
import type { Client } from '../types'

export function ClientListScreen() {
  const [clients, setClients] = useState<Client[]>([])
  const [balances, setBalances] = useState<Map<string, number>>(new Map())
  const [query, setQuery] = useState('')

  useEffect(() => {
    Promise.all([
      db.clients.orderBy('fullName').toArray(),
      balancesByClient(),
    ]).then(([list, map]) => {
      setClients(list)
      setBalances(map)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    const list = q
      ? clients.filter((client) => {
          const blob = `${client.fullName} ${client.tradeName} ${client.company}`.toLocaleLowerCase(
            'pt-BR',
          )
          return blob.includes(q)
        })
      : clients
    return [...list].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'pt-BR', { sensitivity: 'base' }),
    )
  }, [clients, query])

  return (
    <main>
      <Topbar
        title="Clientes"
        backTo="/menu"
        action={
          <Link to="/clientes/novo" className="icon-btn" aria-label="Novo cliente">
            +
          </Link>
        }
      />
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome..."
      />
      {filtered.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado">
          Cadastre o primeiro cliente para registrar vendas.
        </EmptyState>
      ) : (
        <div className="stack">
          {filtered.map((client) => {
            const due = balances.get(client.id) ?? 0
            return (
              <article key={client.id} className="client-card">
                <h2>{client.fullName}</h2>
                {client.tradeName ? <p className="muted">{client.tradeName}</p> : null}
                <p className={`balance ${due > 0 ? 'due' : 'zero'}`}>
                  Saldo devedor: {formatBRL(due)}
                </p>
                <div className="actions">
                  <Link to={`/clientes/${client.id}/lancamentos`}>
                    <Button variant="navy" block={false}>
                      Lançar
                    </Button>
                  </Link>
                  <Link to={`/clientes/${client.id}/editar`}>
                    <Button variant="ghost" block={false}>
                      Editar
                    </Button>
                  </Link>
                  <Link to={`/clientes/${client.id}/resumo`}>
                    <Button variant="ghost" block={false}>
                      Ver
                    </Button>
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
