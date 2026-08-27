import { db } from '../db'
import type { Product, ServerRegistration, WifiMemory } from '../types'

export const HOST_PORT = 3847
export const SERVER_SETTINGS_ID = 'lan-server'
export const WIFI_SETTINGS_ID = 'lan-wifi'

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function subnetHosts(ipv4: string): string[] {
  const parts = ipv4.split('.')
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`
  const hosts: string[] = []
  for (let i = 1; i <= 254; i += 1) hosts.push(`${prefix}.${i}`)
  return hosts
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const data = (await response.json()) as unknown
    if (!response.ok) {
      const error = typeof data === 'object' && data && 'error' in data ? String((data as { error: string }).error) : `HTTP ${response.status}`
      throw new Error(error)
    }
    return data
  } finally {
    window.clearTimeout(timer)
  }
}

async function discoverHosts(ipv4: string | null): Promise<string[]> {
  const candidates = new Set<string>(['127.0.0.1', '10.0.2.2'])
  if (ipv4 && isPrivateIpv4(ipv4)) {
    for (const host of subnetHosts(ipv4)) candidates.add(host)
  }
  const found: string[] = []
  const list = [...candidates]
  const batchSize = 32
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (host) => {
        const baseUrl = `http://${host}:${HOST_PORT}`
        try {
          const data = (await fetchJson(`${baseUrl}/api/discover`, { method: 'GET' }, 500)) as { app?: string }
          if (data.app === 'vendas-beauty-brasil-host') return baseUrl
        } catch {
          return null
        }
        return null
      }),
    )
    for (const url of results) if (url) found.push(url)
    if (found.length) return found
  }
  return found
}

export async function getServerRegistration(): Promise<ServerRegistration | undefined> {
  const row = await db.settings.get(SERVER_SETTINGS_ID)
  return row?.id === 'lan-server' ? row : undefined
}

export async function getSavedWifi(): Promise<WifiMemory | undefined> {
  const row = await db.settings.get(WIFI_SETTINGS_ID)
  return row?.id === 'lan-wifi' ? row : undefined
}

export async function saveLocalWifi(ssid: string): Promise<WifiMemory> {
  const record: WifiMemory = { id: WIFI_SETTINGS_ID, ssid, savedAt: Date.now() }
  await db.settings.put(record)
  return record
}

export function productMissingOnPhone(local: Product[], incoming: Product): boolean {
  if (local.some((item) => item.id === incoming.id)) return false
  const barcode = incoming.barcode.trim()
  if (barcode && local.some((item) => item.barcode.trim() === barcode)) return false
  return true
}

export async function pairAndSync(code: string, ipv4: string | null): Promise<{
  registration: ServerRegistration
  clients: number
  ledger: number
  newProducts: number
}> {
  const trimmed = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('Digite o código de 6 dígitos exibido no servidor')
  }
  const hosts = await discoverHosts(ipv4)
  if (!hosts.length) {
    throw new Error('Nenhum servidor encontrado nesta rede Wi-Fi')
  }

  let baseUrl = ''
  let token = ''
  let lastError = 'Código inválido'
  for (const host of hosts) {
    try {
      const paired = (await fetchJson(
        `${host}/api/pair`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        },
        4000,
      )) as { token?: string }
      if (paired.token) {
        baseUrl = host
        token = paired.token
        break
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }
  if (!baseUrl || !token) throw new Error(lastError)

  const [clients, products, sales, payments, wifi] = await Promise.all([
    db.clients.toArray(),
    db.products.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    getSavedWifi(),
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
    15000,
  )) as { products?: Product[] }

  const remoteProducts = Array.isArray(synced.products) ? synced.products : []
  const incoming = remoteProducts.filter((item) => productMissingOnPhone(products, item))
  if (incoming.length) await db.products.bulkPut(incoming)

  const registration: ServerRegistration = {
    id: SERVER_SETTINGS_ID,
    ssid: wifi?.ssid || 'Wi-Fi local',
    baseUrl,
    token,
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
