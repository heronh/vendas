export interface Client {
  id: string
  fullName: string
  tradeName: string
  company: string
  phone: string
  email: string
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
  number: string
  complement: string
  createdAt: number
  updatedAt: number
}

export interface Product {
  id: string
  description: string
  supplier: string
  costPriceCents: number
  salePriceCents: number
  barcode: string
  imageDataUrl?: string
  createdAt: number
  updatedAt: number
}

export interface Sale {
  id: string
  clientId: string
  productId?: string
  productDescription: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  occurredAt: number
  createdAt: number
}

export interface Payment {
  id: string
  clientId: string
  amountCents: number
  occurredAt: number
  notes?: string
  createdAt: number
}

export interface Profile {
  id: 'local'
  displayName: string
  company: string
  phone: string
  email: string
  updatedAt: number
}

export interface BackupPayload {
  version: 1
  app: 'vendas-beauty-brasil'
  exportedAt: string
  clients: Client[]
  products: Product[]
  sales: Sale[]
  payments: Payment[]
  profile: Profile | null
}

export interface ServerRegistration {
  id: 'lan-server'
  ssid: string
  baseUrl: string
  token: string
  pairedAt: number
}

export interface WifiMemory {
  id: 'lan-wifi'
  ssid: string
  savedAt: number
}

export type AppSetting = ServerRegistration | WifiMemory

export type ReportPeriod = '30d' | 'month'

export interface LedgerEntry {
  id: string
  kind: 'sale' | 'payment'
  occurredAt: number
  amountCents: number
  title: string
  detail?: string
}
