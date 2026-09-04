import { CLOUD_API_URL, CLOUD_PAIRING_CODE } from '../config'
import { db } from '../db'
import type { Client, Payment, Product, Sale, ServerRegistration } from '../types'

export const SERVER_SETTINGS_ID = 'lan-server'
export const WIFI_SETTINGS_ID = 'lan-wifi'

const REQUIRED_TABLES = ['clients', 'device_tokens', 'payments', 'products', 'sales']

export type CloudSnapshot = {
  products?: Product[]
  clients?: Client[]
  sales?: Sale[]
  payments?: Payment[]
}

export type SyncCounts = {
  clients: number
  ledger: number
  products: number
}

export function notifyCloudSync(ok: boolean, text: string) {
  window.dispatchEvent(new CustomEvent('vendas-sync', { detail: { ok, text } }))
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const data = (await response.json()) as unknown
    if (!response.ok) {
      const error =
        typeof data === 'object' && data && 'error' in data
          ? String((data as { error: string }).error)
          : `HTTP ${response.status}`
      throw new Error(error)
    }
    return data
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao falar com o banco')
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

function newerOrMissing(localUpdatedAt: number | undefined, remoteUpdatedAt: number): boolean {
  return localUpdatedAt == null || remoteUpdatedAt >= localUpdatedAt
}

async function mergeFromRemote(remote: CloudSnapshot): Promise<void> {
  const [localClients, localProducts] = await Promise.all([db.clients.toArray(), db.products.toArray()])
  const clientsById = new Map(localClients.map((item) => [item.id, item]))
  const productsById = new Map(localProducts.map((item) => [item.id, item]))

  const clients = (remote.clients ?? []).filter((item) => newerOrMissing(clientsById.get(item.id)?.updatedAt, item.updatedAt))
  const products = (remote.products ?? []).filter((item) => {
    const local = productsById.get(item.id)
    if (!local) {
      const barcode = item.barcode.trim()
      if (barcode && localProducts.some((row) => row.barcode.trim() === barcode)) return false
      return true
    }
    return newerOrMissing(local.updatedAt, item.updatedAt)
  })

  await db.transaction('rw', db.clients, db.products, db.sales, db.payments, async () => {
    if (clients.length) await db.clients.bulkPut(clients)
    if (products.length) await db.products.bulkPut(products)
    if (remote.sales?.length) await db.sales.bulkPut(remote.sales)
    if (remote.payments?.length) await db.payments.bulkPut(remote.payments)
  })
}

async function postSync(baseUrl: string, token: string, partial?: CloudSnapshot): Promise<CloudSnapshot> {
  const [clients, products, sales, payments] = partial
    ? [
        partial.clients ?? [],
        partial.products ?? [],
        partial.sales ?? [],
        partial.payments ?? [],
      ]
    : await Promise.all([db.clients.toArray(), db.products.toArray(), db.sales.toArray(), db.payments.toArray()])

  const synced = (await fetchJson(
    `${baseUrl}/api/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token, clients, products, sales, payments }),
    },
    partial ? 20000 : 45000,
  )) as CloudSnapshot

  await mergeFromRemote(synced)
  return synced
}

export async function probeDatabase(): Promise<string[]> {
  const baseUrl = CLOUD_API_URL
  if (!baseUrl.startsWith('https://') || baseUrl.includes('placeholder')) {
    throw new Error('URL da API na nuvem ainda não foi configurada neste aplicativo')
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${baseUrl}/api/ready`, { method: 'GET', signal: controller.signal })
    if (response.status === 404) {
      const discovered = (await fetchJson(`${baseUrl}/api/discover`, { method: 'GET' }, 8000)) as { app?: string }
      if (discovered.app !== 'vendas-beauty-brasil-host') {
        throw new Error('Não foi possível conectar ao banco')
      }
      return REQUIRED_TABLES
    }
    const data = (await response.json()) as { ok?: boolean; tables?: string[]; error?: string }
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Banco remoto indisponível')
    }
    const tables = Array.isArray(data.tables) ? data.tables : []
    const missing = REQUIRED_TABLES.filter((name) => !tables.includes(name))
    if (missing.length) {
      throw new Error(`Tabelas ausentes no banco: ${missing.join(', ')}`)
    }
    return tables
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao falar com o banco')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

async function persistRegistration(baseUrl: string, token: string): Promise<ServerRegistration> {
  const registration: ServerRegistration = {
    id: SERVER_SETTINGS_ID,
    ssid: 'Nuvem',
    baseUrl,
    token,
    pairedAt: Date.now(),
  }
  await db.settings.put(registration)
  return registration
}

export async function ensureDevice(): Promise<ServerRegistration> {
  const existing = await getServerRegistration()
  if (existing?.token && existing.baseUrl) return existing

  const baseUrl = CLOUD_API_URL
  const discovered = (await fetchJson(`${baseUrl}/api/discover`, { method: 'GET' }, 8000)) as { app?: string }
  if (discovered.app !== 'vendas-beauty-brasil-host') {
    throw new Error('O endereço da nuvem não é o servidor do Controle de Vendas')
  }

  const code = CLOUD_PAIRING_CODE
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Cadastre a nuvem em Backup e sincronização para conectar ao banco')
  }

  const paired = (await fetchJson(
    `${baseUrl}/api/pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    },
    10000,
  )) as { token?: string }
  if (!paired.token) throw new Error('Código inválido')
  return persistRegistration(baseUrl, paired.token)
}

export async function connectAndSync(): Promise<SyncCounts> {
  await probeDatabase()
  const device = await ensureDevice()
  await postSync(device.baseUrl, device.token)
  const [clients, products, sales, payments] = await Promise.all([
    db.clients.count(),
    db.products.count(),
    db.sales.count(),
    db.payments.count(),
  ])
  return { clients, products, ledger: sales + payments }
}

export async function pushChanges(partial: CloudSnapshot): Promise<void> {
  const device = await ensureDevice()
  await postSync(device.baseUrl, device.token, partial)
}

export async function pushAndNotify(partial: CloudSnapshot, success: string): Promise<void> {
  try {
    await pushChanges(partial)
    notifyCloudSync(true, success)
  } catch (err) {
    const text = err instanceof Error ? err.message : 'Falha ao atualizar o banco'
    notifyCloudSync(false, text)
    throw new Error(text)
  }
}

export function productMissingOnPhone(local: Product[], incoming: Product): boolean {
  if (local.some((item) => item.id === incoming.id)) return false
  const barcode = incoming.barcode.trim()
  if (barcode && local.some((item) => item.barcode.trim() === barcode)) return false
  return true
}

export async function pairAndSync(code: string): Promise<{
  registration: ServerRegistration
  clients: number
  ledger: number
  newProducts: number
}> {
  const trimmed = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('Digite o código de 6 dígitos exibido no servidor')
  }

  await probeDatabase()
  const baseUrl = CLOUD_API_URL
  const paired = (await fetchJson(
    `${baseUrl}/api/pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed }),
    },
    10000,
  )) as { token?: string }
  if (!paired.token) throw new Error('Código inválido')

  const registration = await persistRegistration(baseUrl, paired.token)
  const beforeProducts = await db.products.count()
  await postSync(baseUrl, paired.token)
  const [clients, products, sales, payments] = await Promise.all([
    db.clients.count(),
    db.products.count(),
    db.sales.count(),
    db.payments.count(),
  ])
  return {
    registration,
    clients,
    ledger: sales + payments,
    newProducts: Math.max(0, products - beforeProducts),
  }
}

export async function syncNow(): Promise<{ clients: number; ledger: number; newProducts: number }> {
  const counts = await connectAndSync()
  return { clients: counts.clients, ledger: counts.ledger, newProducts: counts.products }
}

export async function forgetServer(): Promise<void> {
  await db.settings.delete(SERVER_SETTINGS_ID)
  await db.settings.delete(WIFI_SETTINGS_ID)
}
