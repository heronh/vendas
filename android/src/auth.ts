import { db } from './db'
import type { AppLock } from './types'

export const LOCK_SETTINGS_ID = 'app-lock'
export const DEFAULT_PASSWORD = '000000'
export const UNLOCKED_KEY = 'vendas-unlocked'

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getLock(): Promise<AppLock | undefined> {
  const row = await db.settings.get(LOCK_SETTINGS_ID)
  return row?.id === LOCK_SETTINGS_ID ? row : undefined
}

export async function isDefaultPassword(): Promise<boolean> {
  const lock = await getLock()
  const def = await hashPassword(DEFAULT_PASSWORD)
  return !lock || lock.passwordHash === def
}

export async function checkPassword(plain: string): Promise<boolean> {
  const lock = await getLock()
  const hash = await hashPassword(plain)
  if (!lock) return plain === DEFAULT_PASSWORD
  return lock.passwordHash === hash
}

export async function setPassword(plain: string): Promise<void> {
  const passwordHash = await hashPassword(plain)
  const lock: AppLock = {
    id: LOCK_SETTINGS_ID,
    passwordHash,
    updatedAt: Date.now(),
  }
  await db.settings.put(lock)
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

export function setUnlocked(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(UNLOCKED_KEY, '1')
    else sessionStorage.removeItem(UNLOCKED_KEY)
  } catch {
    /* ignore */
  }
}
