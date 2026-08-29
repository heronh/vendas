import Dexie, { type Table } from 'dexie'
import type { AppSetting, Client, Payment, Product, Profile, Sale } from './types'

export class VendasDB extends Dexie {
  clients!: Table<Client, string>
  products!: Table<Product, string>
  sales!: Table<Sale, string>
  payments!: Table<Payment, string>
  profile!: Table<Profile, string>
  settings!: Table<AppSetting, string>

  constructor() {
    super('vendas-beauty-brasil')
    this.version(1).stores({
      clients: 'id, fullName, tradeName, company',
      products: 'id, description, barcode',
      sales: 'id, clientId, occurredAt, productId',
      payments: 'id, clientId, occurredAt',
      profile: 'id',
    })
    this.version(2).stores({
      settings: 'id',
    })
  }
}

export const db = new VendasDB()

export function newId(): string {
  return crypto.randomUUID()
}

export async function getOrCreateProfile(): Promise<Profile> {
  const existing = await db.profile.get('local')
  if (existing) return existing
  const created: Profile = {
    id: 'local',
    displayName: '',
    company: 'Beauty Brasil SJC',
    phone: '',
    email: '',
    updatedAt: Date.now(),
  }
  await db.profile.put(created)
  return created
}

export async function clientBalanceCents(clientId: string): Promise<number> {
  const [sales, payments] = await Promise.all([
    db.sales.where('clientId').equals(clientId).toArray(),
    db.payments.where('clientId').equals(clientId).toArray(),
  ])
  const sold = sales.reduce((sum, sale) => sum + sale.totalCents, 0)
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  return sold - paid
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.clients, db.products, db.sales, db.payments, db.profile, db.settings], async () => {
      await Promise.all([
        db.clients.clear(),
        db.products.clear(),
        db.sales.clear(),
        db.payments.clear(),
        db.profile.clear(),
        db.settings.clear(),
      ])
  })
}

export async function balancesByClient(): Promise<Map<string, number>> {
  const [sales, payments] = await Promise.all([
    db.sales.toArray(),
    db.payments.toArray(),
  ])
  const map = new Map<string, number>()
  for (const sale of sales) {
    map.set(sale.clientId, (map.get(sale.clientId) ?? 0) + sale.totalCents)
  }
  for (const payment of payments) {
    map.set(payment.clientId, (map.get(payment.clientId) ?? 0) - payment.amountCents)
  }
  return map
}
