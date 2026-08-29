import { CLOUD_API_URL } from '../config'
import { db } from '../db'
import type { Product, ServerRegistration } from '../types'

export const SERVER_SETTINGS_ID = 'lan-server'
export const WIFI_SETTINGS_ID = 'lan-wifi'

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

async function postSync(baseUrl: string, token: string): Promise<Product[]> {
  const [clients, products, sales, payments] = await Promise.all([
    db.clients.toArray(),
    db.products.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
  ])

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
    45000,
  )) as { products?: Product[] }

  const remoteProducts = Array.isArray(synced.products) ? synced.products : []
  const incoming = remoteProducts.filter((item) => productMissingOnPhone(products, item))
  if (incoming.length) await db.products.bulkPut(incoming)
  return incoming
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

  const [clients, sales, payments, incoming] = await Promise.all([
    db.clients.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    postSync(baseUrl, paired.token),
  ])

  const registration: ServerRegistration = {
    id: SERVER_SETTINGS_ID,
    ssid: 'Nuvem',
    baseUrl,
    token: paired.token,
    pairedAt: Date.now(),
  }
  await db.settings.put(registration)
  return {
    registration,
    clients: clients.length,
    ledger: sales.length + payments.length,
    newProducts: incoming.length,
  }
}

export async function syncNow(): Promise<{ clients: number; ledger: number; newProducts: number }> {
  const registration = await getServerRegistration()
  if (!registration?.token || !registration.baseUrl) {
    throw new Error('Nenhum servidor cadastrado')
  }
  const [clients, sales, payments, incoming] = await Promise.all([
    db.clients.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    postSync(registration.baseUrl, registration.token),
  ])
  return {
    clients: clients.length,
    ledger: sales.length + payments.length,
    newProducts: incoming.length,
  }
}

export async function forgetServer(): Promise<void> {
  await db.settings.delete(SERVER_SETTINGS_ID)
  await db.settings.delete(WIFI_SETTINGS_ID)
}
