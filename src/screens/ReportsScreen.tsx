import { useEffect, useState } from 'react'
import { EmptyState, Topbar } from '../components/ui'
import { balancesByClient, db } from '../db'
import { formatBRL } from '../format'
import { buildReport, type ReportData } from '../services/reports'
import type { ReportPeriod } from '../types'

export function ReportsScreen() {
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [report, setReport] = useState<ReportData | null>(null)

  useEffect(() => {
    Promise.all([
      db.clients.toArray(),
      db.products.toArray(),
      db.sales.toArray(),
      db.payments.toArray(),
      balancesByClient(),
    ]).then(([clients, products, sales, payments, balances]) => {
      setReport(
        buildReport({
          period,
          clients,
          products,
          sales,
          payments,
          balances,
        }),
      )
    })
  }, [period])

  return (
    <main>
      <Topbar title="Relatórios e métricas" backTo="/menu" />
      <label className="field">
        <span className="field-label">Filtro temporal</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
          <option value="month">Mês corrente</option>
          <option value="30d">Últimos 30 dias</option>
        </select>
      </label>
      {!report ? (
        <p className="muted">Carregando…</p>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="report-grid">
            <div className="metric">
              <span>Vendas</span>
              <strong>{formatBRL(report.salesTotalCents)}</strong>
            </div>
            <div className="metric">
              <span>Pagamentos</span>
              <strong>{formatBRL(report.paymentsTotalCents)}</strong>
            </div>
          </div>
          <section className="card">
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', marginTop: 0 }}>
              Maiores saldos devedores
            </h2>
            <p className="muted">Saldo atual (todas as datas)</p>
            {report.topDebtors.length === 0 ? (
              <EmptyState title="Nenhum saldo em aberto" />
            ) : (
              <ol className="rank">
                {report.topDebtors.map((row) => (
                  <li key={row.clientId}>
                    {row.name} — {formatBRL(row.cents)}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="card">
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', marginTop: 0 }}>
              Ranking por volume de compras
            </h2>
            <p className="muted">{report.range.label}</p>
            {report.topBuyers.length === 0 ? (
              <EmptyState title="Sem compras no período" />
            ) : (
              <ol className="rank">
                {report.topBuyers.map((row) => (
                  <li key={row.clientId}>
                    {row.name} — {formatBRL(row.cents)}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="card">
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', marginTop: 0 }}>
              Mais vendidos por faturamento
            </h2>
            {report.topProductsByRevenue.length === 0 ? (
              <EmptyState title="Sem produtos no período" />
            ) : (
              <ol className="rank">
                {report.topProductsByRevenue.map((row) => (
                  <li key={row.key}>
                    {row.name} — {formatBRL(row.revenueCents)}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="card">
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', marginTop: 0 }}>
              Mais vendidos por quantidade
            </h2>
            {report.topProductsByQuantity.length === 0 ? (
              <EmptyState title="Sem produtos no período" />
            ) : (
              <ol className="rank">
                {report.topProductsByQuantity.map((row) => (
                  <li key={row.key}>
                    {row.name} ({row.quantity} un)
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
