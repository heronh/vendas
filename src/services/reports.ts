import type { Client, Payment, Product, ReportPeriod, Sale } from '../types'

export interface PeriodRange {
  from: number
  to: number
  label: string
}

export function periodRange(period: ReportPeriod, now = new Date()): PeriodRange {
  const to = now.getTime()
  if (period === '30d') {
    return {
      from: to - 30 * 24 * 60 * 60 * 1000,
      to,
      label: 'Últimos 30 dias',
    }
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return {
    from,
    to,
    label: 'Mês corrente',
  }
}

function inRange(timestamp: number, range: PeriodRange): boolean {
  return timestamp >= range.from && timestamp <= range.to
}

export interface ClientRank {
  clientId: string
  name: string
  cents: number
}

export interface ProductRank {
  key: string
  name: string
  quantity: number
  revenueCents: number
}

export interface ReportData {
  range: PeriodRange
  salesTotalCents: number
  paymentsTotalCents: number
  topDebtors: ClientRank[]
  topBuyers: ClientRank[]
  topProductsByRevenue: ProductRank[]
  topProductsByQuantity: ProductRank[]
}

export function buildReport(input: {
  period: ReportPeriod
  clients: Client[]
  products: Product[]
  sales: Sale[]
  payments: Payment[]
  balances: Map<string, number>
  now?: Date
}): ReportData {
  const range = periodRange(input.period, input.now)
  const nameByClient = new Map(input.clients.map((client) => [client.id, client.fullName]))
  const periodSales = input.sales.filter((sale) => inRange(sale.occurredAt, range))
  const periodPayments = input.payments.filter((payment) => inRange(payment.occurredAt, range))

  const salesTotalCents = periodSales.reduce((sum, sale) => sum + sale.totalCents, 0)
  const paymentsTotalCents = periodPayments.reduce((sum, payment) => sum + payment.amountCents, 0)

  const topDebtors: ClientRank[] = [...input.balances.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([clientId, cents]) => ({
      clientId,
      name: nameByClient.get(clientId) ?? 'Cliente removido',
      cents,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 10)

  const spent = new Map<string, number>()
  for (const sale of periodSales) {
    spent.set(sale.clientId, (spent.get(sale.clientId) ?? 0) + sale.totalCents)
  }
  const topBuyers: ClientRank[] = [...spent.entries()]
    .map(([clientId, cents]) => ({
      clientId,
      name: nameByClient.get(clientId) ?? 'Cliente removido',
      cents,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 10)

  const productStats = new Map<string, ProductRank>()
  for (const sale of periodSales) {
    const key = sale.productId || sale.productDescription
    const current = productStats.get(key) ?? {
      key,
      name: sale.productDescription,
      quantity: 0,
      revenueCents: 0,
    }
    current.quantity += sale.quantity
    current.revenueCents += sale.totalCents
    productStats.set(key, current)
  }
  const products = [...productStats.values()]
  const topProductsByRevenue = [...products].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10)
  const topProductsByQuantity = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 10)

  return {
    range,
    salesTotalCents,
    paymentsTotalCents,
    topDebtors,
    topBuyers,
    topProductsByRevenue,
    topProductsByQuantity,
  }
}
