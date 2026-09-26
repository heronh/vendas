import { db, newId } from './db'
import type { Client, Product, Sale } from './types'

export const isDemo = import.meta.env.VITE_DEMO === 'true'

export async function seedDemoIfEmpty(): Promise<void> {
  if (!isDemo) return
  const flagged = await db.settings.get('demo-seeded')
  if (flagged?.id === 'demo-seeded') return

  const [clientCount, productCount] = await Promise.all([db.clients.count(), db.products.count()])
  if (clientCount > 0 || productCount > 0) {
    await db.settings.put({ id: 'demo-seeded', seededAt: Date.now() })
    return
  }

  const now = Date.now()
  const anaId = newId()
  const marinaId = newId()
  const limpezaId = newId()
  const hidratacaoId = newId()

  const ana: Client = {
    id: anaId,
    fullName: 'Ana Paula Ribeiro',
    tradeName: '',
    company: '',
    phone: '(12) 98811-2040',
    email: 'ana.ribeiro@example.com',
    cep: '12245-720',
    street: 'Avenida Andrômeda',
    neighborhood: 'Jardim Satélite',
    city: 'São José dos Campos',
    state: 'SP',
    number: '1200',
    complement: '',
    createdAt: now,
    updatedAt: now,
  }
  const marina: Client = {
    id: marinaId,
    fullName: 'Marina Costa',
    tradeName: '',
    company: '',
    phone: '(12) 99140-7781',
    email: 'marina.costa@example.com',
    cep: '12246-000',
    street: 'Rua das Hortênsias',
    neighborhood: 'Jardim das Indústrias',
    city: 'São José dos Campos',
    state: 'SP',
    number: '85',
    complement: 'sala 2',
    createdAt: now,
    updatedAt: now,
  }
  const limpeza: Product = {
    id: limpezaId,
    description: 'Limpeza de pele',
    supplier: 'Beauty Brasil SJC',
    costPriceCents: 6000,
    salePriceCents: 18000,
    barcode: '',
    createdAt: now,
    updatedAt: now,
  }
  const hidratacao: Product = {
    id: hidratacaoId,
    description: 'Hidratação facial',
    supplier: 'Beauty Brasil SJC',
    costPriceCents: 4500,
    salePriceCents: 14000,
    barcode: '',
    createdAt: now,
    updatedAt: now,
  }
  const sale: Sale = {
    id: newId(),
    clientId: anaId,
    productId: limpezaId,
    productDescription: limpeza.description,
    quantity: 1,
    unitPriceCents: limpeza.salePriceCents,
    totalCents: limpeza.salePriceCents,
    occurredAt: now,
    createdAt: now,
  }

  await db.transaction('rw', [db.clients, db.products, db.sales, db.settings], async () => {
    await db.clients.bulkAdd([ana, marina])
    await db.products.bulkAdd([limpeza, hidratacao])
    await db.sales.add(sale)
    await db.settings.put({ id: 'demo-seeded', seededAt: now })
  })
}
