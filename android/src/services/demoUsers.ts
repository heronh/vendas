import { hashPassword, setUnlocked } from '../auth'
import { db, newId } from '../db'
import type { DemoRole, DemoUser } from '../types'

const SESSION_KEY = 'vendas-demo-session'

export type DemoSession = {
  username: string
  displayName: string
  role: DemoRole
}

const FIXED_USERS: Array<{ username: string; displayName: string; password: string; role: DemoRole }> = [
  { username: 'mariluci', displayName: 'Mariluci', password: 'mariluci', role: 'admin' },
  { username: 'heron', displayName: 'Heron', password: 'heron', role: 'colaborador' },
]

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function getDemoSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoSession>
    if (!parsed.username || (parsed.role !== 'admin' && parsed.role !== 'colaborador')) return null
    return {
      username: parsed.username,
      displayName: parsed.displayName || parsed.username,
      role: parsed.role,
    }
  } catch {
    return null
  }
}

export function clearDemoSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
  setUnlocked(false)
}

function remember(user: DemoUser): DemoSession {
  const session: DemoSession = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  setUnlocked(true)
  return session
}

export async function ensureDemoUsers(): Promise<void> {
  for (const row of FIXED_USERS) {
    const existing = await db.users.where('username').equals(row.username).first()
    if (existing) continue
    const user: DemoUser = {
      id: newId(),
      username: row.username,
      displayName: row.displayName,
      passwordHash: await hashPassword(row.password),
      role: row.role,
      blocked: false,
      fixed: true,
      createdAt: Date.now(),
    }
    try {
      await db.users.add(user)
    } catch {
      const again = await db.users.where('username').equals(row.username).first()
      if (!again) throw new Error('Não foi possível preparar os usuários de teste.')
    }
  }
}

export async function loginDemo(username: string, password: string): Promise<DemoSession> {
  await ensureDemoUsers()
  const key = normalizeUsername(username)
  const user = key ? await db.users.where('username').equals(key).first() : undefined
  const hash = await hashPassword(password)
  if (!user || user.passwordHash !== hash) {
    throw new Error('Usuário ou senha inválidos.')
  }
  if (user.blocked) {
    throw new Error('Usuário bloqueado.')
  }
  return remember(user)
}

export async function listCollaborators(): Promise<DemoUser[]> {
  const rows = await db.users.orderBy('username').toArray()
  return rows.filter((user) => user.role === 'colaborador')
}

export async function createCollaborator(username: string, password: string): Promise<void> {
  const key = normalizeUsername(username)
  const displayName = username.trim()
  if (!key) throw new Error('Informe o usuário.')
  if (password.length < 4) throw new Error('A senha precisa ter pelo menos 4 caracteres.')
  const existing = await db.users.where('username').equals(key).first()
  if (existing) throw new Error('Já existe um usuário com esse nome.')
  const user: DemoUser = {
    id: newId(),
    username: key,
    displayName,
    passwordHash: await hashPassword(password),
    role: 'colaborador',
    blocked: false,
    fixed: false,
    createdAt: Date.now(),
  }
  await db.users.add(user)
}

export async function setCollaboratorBlocked(id: string, blocked: boolean): Promise<void> {
  const user = await db.users.get(id)
  if (!user || user.role !== 'colaborador') throw new Error('Colaborador não encontrado.')
  await db.users.update(id, { blocked })
}
