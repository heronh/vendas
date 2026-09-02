import { isValidEmail, normalizeEmail, setPassword } from '../auth'
import { CLOUD_API_URL } from '../config'
import { db, getOrCreateProfile } from '../db'
import type { AppModeName, AppModeSetting, CompanyProfileSetting, ServerRegistration } from '../types'

export const MODE_SETTINGS_ID = 'app-mode'
export const COMPANY_SETTINGS_ID = 'company-profile'
const SERVER_SETTINGS_ID = 'lan-server'

export type AccountStatus = {
  ok?: boolean
  token?: string
  enabled?: boolean
  passwordReset?: boolean
  mode?: AppModeName
  role?: 'owner' | 'member' | ''
  licenseStatus?: AppModeSetting['licenseStatus']
  licenseOk?: boolean
  companyId?: string
  signature?: string
  companyName?: string
  kickedFromGroup?: boolean
  userId?: string
  email?: string
  error?: string
}

export async function getAppMode(): Promise<AppModeSetting | undefined> {
  const row = await db.settings.get(MODE_SETTINGS_ID)
  return row?.id === MODE_SETTINGS_ID ? row : undefined
}

export function licenseAllows(mode: AppModeSetting | undefined): boolean {
  if (!mode) return false
  if (mode.mode === 'group' && mode.licenseStatus === 'group_covered') return true
  return mode.licenseStatus === 'paid'
}

export async function saveAppMode(partial: Omit<AppModeSetting, 'id'>): Promise<void> {
  const setting: AppModeSetting = { id: MODE_SETTINGS_ID, ...partial }
  await db.settings.put(setting)
}

async function deviceIdentity(): Promise<{ deviceName: string; professional: string; email: string; phone: string }> {
  const profile = await getOrCreateProfile()
  const ua = navigator.userAgent
  const android = ua.match(/Android[^;]*;\s*([^)]+)\)/)
  const deviceName = android?.[1]?.replace(/\s*Build\/.*$/, '').trim() || 'Android'
  return {
    deviceName,
    professional: profile.displayName.trim(),
    email: normalizeEmail(profile.email),
    phone: profile.phone.trim(),
  }
}

async function postMode(path: string, extra: Record<string, unknown> = {}): Promise<AccountStatus> {
  const ident = await deviceIdentity()
  if (!isValidEmail(ident.email)) {
    throw new Error('Cadastre um e-mail válido antes de continuar')
  }
  const baseUrl = CLOUD_API_URL
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ident, ...extra }),
  })
  const data = (await response.json()) as AccountStatus
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  await applyAccountStatus(data, baseUrl)
  return data
}

export async function applyAccountStatus(data: AccountStatus, baseUrl = CLOUD_API_URL): Promise<void> {
  if (data.token) {
    await db.settings.put({
      id: SERVER_SETTINGS_ID,
      ssid: 'Nuvem',
      baseUrl,
      token: data.token,
      pairedAt: Date.now(),
    })
  }
  const prev = await getAppMode()
  const mode = (data.mode || prev?.mode || 'stand_alone') as AppModeName
  await saveAppMode({
    mode,
    companyId: data.companyId || '',
    signature: data.signature || prev?.signature,
    companyName: data.companyName || prev?.companyName,
    role: data.role || '',
    licenseStatus: data.licenseStatus || prev?.licenseStatus || 'pending',
    userId: data.userId || prev?.userId,
    updatedAt: Date.now(),
  })
  if (data.kickedFromGroup) {
    await saveAppMode({
      mode: 'stand_alone',
      companyId: '',
      signature: '',
      companyName: '',
      role: '',
      licenseStatus: 'pending',
      userId: data.userId || prev?.userId,
      updatedAt: Date.now(),
    })
  }
}

export async function chooseStandalone(): Promise<void> {
  await postMode('/api/mode/standalone')
}

export async function chooseConnected(): Promise<void> {
  await postMode('/api/mode/connected')
}

export async function createCompany(company: Omit<CompanyProfileSetting, 'id' | 'signature' | 'updatedAt'>): Promise<AccountStatus> {
  const data = await postMode('/api/mode/company', { company })
  const companyRow: CompanyProfileSetting = {
    id: COMPANY_SETTINGS_ID,
    ...company,
    signature: data.signature || '',
    updatedAt: Date.now(),
  }
  await db.settings.put(companyRow)
  return data
}

export async function joinCompany(signature: string): Promise<AccountStatus> {
  return postMode('/api/mode/join', { signature: signature.trim().toLowerCase() })
}

async function getRegistration(): Promise<ServerRegistration | undefined> {
  const row = await db.settings.get(SERVER_SETTINGS_ID)
  return row?.id === 'lan-server' ? row : undefined
}
export async function refreshAccountStatus(): Promise<AccountStatus | null> {
  const registration = await getRegistration()
  if (!registration?.token || !registration.baseUrl) return null
  try {
    const response = await fetch(`${registration.baseUrl}/api/device`, {
      headers: { Authorization: `Bearer ${registration.token}` },
    })
    const data = (await response.json()) as AccountStatus
    if (!response.ok) return data
    await applyAccountStatus(data, registration.baseUrl)
    return data
  } catch {
    return null
  }
}

export async function fetchMembers(): Promise<Array<{ id: string; email: string; displayName: string; role: string }>> {
  const registration = await getRegistration()
  if (!registration?.token || !registration.baseUrl) return []
  const response = await fetch(`${registration.baseUrl}/api/members`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  })
  const data = (await response.json()) as { members?: Array<{ id: string; email: string; displayName: string; role: string }> }
  return data.members ?? []
}

export async function excludeMember(id: string): Promise<void> {
  const registration = await getRegistration()
  if (!registration?.token || !registration.baseUrl) throw new Error('Sem nuvem')
  const response = await fetch(`${registration.baseUrl}/api/members/${id}/excluir`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${registration.token}` },
  })
  if (!response.ok) {
    const data = (await response.json()) as { error?: string }
    throw new Error(data.error || 'Falha ao excluir')
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${CLOUD_API_URL}/api/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email) }),
  })
  const data = (await response.json()) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Não foi possível solicitar a senha')
}

export async function confirmPasswordReset(email: string, password: string): Promise<void> {
  const response = await fetch(`${CLOUD_API_URL}/api/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  })
  const data = (await response.json()) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Senha inválida')
  await setPassword(password)
}
