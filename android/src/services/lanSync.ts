import { DEFAULT_PASSWORD, isDefaultPassword, isValidEmail, normalizeEmail, setPassword } from '../auth'
import { CLOUD_API_URL } from '../config'
import { db, getOrCreateProfile } from '../db'
import type { Client, Payment, Product, Sale, ServerRegistration } from '../types'

export const SERVER_SETTINGS_ID = 'lan-server'
export const WIFI_SETTINGS_ID = 'lan-wifi'

export class DevicePendingError extends Error {
  constructor() {
    super('Aguardando liberação do admin no host')
    this.name = 'DevicePendingError'
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const data = (await response.json()) as unknown
    if (response.status === 403 && typeof data === 'object' && data && 'enabled' in data && (data as { enabled: boolean }).enabled === false) {
      throw new DevicePendingError()
    }
    if (!response.ok) {
      const error =
        typeof data === 'object' && data && 'error' in data
          ? String((data as { error: string }).error)
          : `HTTP ${response.status}`
      throw new Error(error)
    }
    return data
  } catch (err) {
    if (err instanceof DevicePendingError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao falar com a nuvem')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

export async function getServerRegistration(): Promise<ServerRegistration | undefined> {
  const row = await db.settings.get(SERVER_SETTINGS_ID)
  return row?.id === 'lan-server' ? row : undefined
}

export function productMissingOnPhone(local: Product[], incoming: Product): boolean {
  if (local.some((item) => item.id === incoming.id)) return false
  const barcode = incoming.barcode.trim()
  if (barcode && local.some((item) => item.barcode.trim() === barcode)) return false
  return true
}

function catalogUpdates(local: Product[], incoming: Product[]): { added: Product[]; updated: Product[] } {
  const added: Product[] = []
  const updated: Product[] = []
  for (const item of incoming) {
    const existing = local.find((row) => row.id === item.id)
    if (existing) {
      if (item.updatedAt > existing.updatedAt) updated.push(item)
      continue
    }
    if (productMissingOnPhone(local, item)) added.push(item)
  }
  return { added, updated }
}

function missingById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const ids = new Set(local.map((item) => item.id))
  return incoming.filter((item) => item.id && !ids.has(item.id))
}

function deviceName(): string {
  const ua = navigator.userAgent
  const android = ua.match(/Android[^;]*;\s*([^)]+)\)/)
  if (android?.[1]) {
    return android[1].replace(/\s*Build\/.*$/, '').trim() || 'Android'
  }
  return 'Android'
}

async function requireUserEmail(): Promise<string> {
  const profile = await getOrCreateProfile()
  const email = normalizeEmail(profile.email)
  if (!isValidEmail(email)) {
    throw new Error('Cadastre o e-mail do usuário no aplicativo antes de falar com a nuvem')
  }
  return email
}

async function devicePayload(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const profile = await getOrCreateProfile()
  return {
    deviceName: deviceName(),
    professional: profile.displayName.trim(),
    email: normalizeEmail(profile.email),
    ...extra,
  }
}

type SyncPayload = {
  products: Product[]
  clients: Client[]
  sales: Sale[]
  payments: Payment[]
  passwordReset: boolean
}

async function applyIncoming(local: {
  products: Product[]
  clients: Client[]
  sales: Sale[]
  payments: Payment[]
}, remote: {
  products?: Product[]
  clients?: Client[]
  sales?: Sale[]
  payments?: Payment[]
}): Promise<{ products: Product[]; clients: Client[]; sales: Sale[]; payments: Payment[] }> {
  const catalog = catalogUpdates(local.products, remote.products ?? [])
  const products = [...catalog.added, ...catalog.updated]
  const clients = missingById(local.clients, remote.clients ?? [])
  const sales = missingById(local.sales, remote.sales ?? [])
  const payments = missingById(local.payments, remote.payments ?? [])
  if (products.length) await db.products.bulkPut(products)
  if (clients.length) await db.clients.bulkPut(clients)
  if (sales.length) await db.sales.bulkPut(sales)
  if (payments.length) await db.payments.bulkPut(payments)
  return { products: catalog.added, clients, sales, payments }
}

async function postSync(baseUrl: string, token: string, extra: Record<string, unknown> = {}): Promise<SyncPayload> {
  const [clients, products, sales, payments, payload] = await Promise.all([
    db.clients.toArray(),
    db.products.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    devicePayload(extra),
  ])

  const synced = (await fetchJson(
    `${baseUrl}/api/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token, clients, products, sales, payments, ...payload }),
    },
    45000,
  )) as {
    products?: Product[]
    clients?: Client[]
    sales?: Sale[]
    payments?: Payment[]
    passwordReset?: boolean
  }

  const incoming = await applyIncoming({ products, clients, sales, payments }, synced)
  return { ...incoming, passwordReset: Boolean(synced.passwordReset) }
}

async function applyPasswordResetFlag(reset: boolean): Promise<void> {
  if (!reset) return
  await setPassword(DEFAULT_PASSWORD)
}

export async function checkCloudPasswordReset(): Promise<boolean> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) return false
  try {
    const data = (await fetchJson(
      `${registration.baseUrl}/api/device`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${registration.token}` },
      },
      8000,
    )) as { passwordReset?: boolean }
    if (data.passwordReset) {
      await applyPasswordResetFlag(true)
      return true
    }
  } catch {
    return false
  }
  return false
}

export async function fetchDeviceStatus(): Promise<{
  enabled: boolean
  passwordReset: boolean
  email: string
} | null> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) return null
  try {
    const data = (await fetchJson(
      `${registration.baseUrl}/api/device`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${registration.token}` },
      },
      8000,
    )) as { enabled?: boolean; passwordReset?: boolean; email?: string }
    if (data.passwordReset) await applyPasswordResetFlag(true)
    return {
      enabled: Boolean(data.enabled),
      passwordReset: Boolean(data.passwordReset),
      email: typeof data.email === 'string' ? data.email : '',
    }
  } catch (err) {
    if (err instanceof DevicePendingError) {
      return { enabled: false, passwordReset: false, email: '' }
    }
    return null
  }
}

export async function notifyPasswordChanged(): Promise<void> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) return
  const def = await isDefaultPassword()
  if (def) return
  try {
    await fetchJson(
      `${registration.baseUrl}/api/device`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registration.token}`,
        },
        body: JSON.stringify({ token: registration.token, passwordChanged: true, ...(await devicePayload()) }),
      },
      8000,
    )
  } catch {
    /* offline: o flag segue no servidor até o próximo aviso */
  }
}

export type SyncResult = {
  registration: ServerRegistration
  sentClients: number
  sentLedger: number
  sentProducts: number
  newClients: number
  newProducts: number
  newLedger: number
  pending: boolean
  passwordReset: boolean
}

async function localCounts(): Promise<{ clients: number; ledger: number; products: number }> {
  const [clients, sales, payments, products] = await Promise.all([
    db.clients.count(),
    db.sales.count(),
    db.payments.count(),
    db.products.count(),
  ])
  return { clients, ledger: sales + payments, products }
}

export async function pairAndSync(code: string): Promise<SyncResult> {
  const trimmed = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('Digite o código de 6 dígitos exibido no servidor')
  }
  await requireUserEmail()

  const baseUrl = CLOUD_API_URL
  if (!baseUrl.startsWith('https://') || baseUrl.includes('placeholder')) {
    throw new Error('URL da API na nuvem ainda não foi configurada neste aplicativo')
  }

  try {
    const discovered = (await fetchJson(`${baseUrl}/api/discover`, { method: 'GET' }, 8000)) as { app?: string }
    if (discovered.app !== 'vendas-beauty-brasil-host') {
      throw new Error('O endereço da nuvem não é o servidor do Controle de Vendas')
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Controle de Vendas')) throw err
    throw new Error('Não foi possível alcançar a API na nuvem. Confira a internet e tente de novo.')
  }

  const extra = await devicePayload()
  const paired = (await fetchJson(
    `${baseUrl}/api/pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed, ...extra }),
    },
    10000,
  )) as { token?: string; enabled?: boolean }
  if (!paired.token) throw new Error('Código inválido')

  const registration: ServerRegistration = {
    id: SERVER_SETTINGS_ID,
    ssid: 'Nuvem',
    baseUrl,
    token: paired.token,
    pairedAt: Date.now(),
  }
  await db.settings.put(registration)

  const sent = await localCounts()
  if (paired.enabled === false) {
    return {
      registration,
      sentClients: sent.clients,
      sentLedger: sent.ledger,
      sentProducts: sent.products,
      newClients: 0,
      newProducts: 0,
      newLedger: 0,
      pending: true,
      passwordReset: false,
    }
  }

  try {
    const incoming = await postSync(baseUrl, paired.token)
    await applyPasswordResetFlag(incoming.passwordReset)
    return {
      registration,
      sentClients: sent.clients,
      sentLedger: sent.ledger,
      sentProducts: sent.products,
      newClients: incoming.clients.length,
      newProducts: incoming.products.length,
      newLedger: incoming.sales.length + incoming.payments.length,
      pending: false,
      passwordReset: incoming.passwordReset,
    }
  } catch (err) {
    if (err instanceof DevicePendingError) {
      return {
        registration,
        sentClients: sent.clients,
        sentLedger: sent.ledger,
        sentProducts: sent.products,
        newClients: 0,
        newProducts: 0,
        newLedger: 0,
        pending: true,
        passwordReset: false,
      }
    }
    throw err
  }
}

export async function syncNow(): Promise<Omit<SyncResult, 'registration' | 'pending'>> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) {
    throw new Error('Nenhum servidor cadastrado')
  }
  await requireUserEmail()
  const sent = await localCounts()
  const incoming = await postSync(registration.baseUrl, registration.token)
  await applyPasswordResetFlag(incoming.passwordReset)
  return {
    sentClients: sent.clients,
    sentLedger: sent.ledger,
    sentProducts: sent.products,
    newClients: incoming.clients.length,
    newProducts: incoming.products.length,
    newLedger: incoming.sales.length + incoming.payments.length,
    passwordReset: incoming.passwordReset,
  }
}

export async function syncIfApproved(): Promise<'pending' | 'synced' | 'skipped' | 'reset'> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) return 'skipped'
  try {
    const status = await fetchDeviceStatus()
    if (!status) return 'skipped'
    if (status.passwordReset) return 'reset'
    if (!status.enabled) return 'pending'
    const result = await syncNow()
    return result.passwordReset ? 'reset' : 'synced'
  } catch (err) {
    if (err instanceof DevicePendingError) return 'pending'
    return 'skipped'
  }
}

export async function forgetServer(): Promise<void> {
  await db.settings.delete(SERVER_SETTINGS_ID)
  await db.settings.delete(WIFI_SETTINGS_ID)
}

export function describeSync(result: {
  sentClients: number
  sentLedger: number
  sentProducts: number
  newClients: number
  newProducts: number
  newLedger: number
}): string {
  const sent =
    `Enviados: ${result.sentClients} cliente(s), ${result.sentProducts} produto(s), ${result.sentLedger} lançamento(s).`
  const received =
    `Recebidos: ${result.newClients} cliente(s), ${result.newProducts} produto(s), ${result.newLedger} lançamento(s).`
  return `${sent} ${received}`
}
