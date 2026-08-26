import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { db } from '../db'
import type { BackupPayload } from '../types'

export async function exportBackup(): Promise<BackupPayload> {
  const [clients, products, sales, payments, profile] = await Promise.all([
    db.clients.toArray(),
    db.products.toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    db.profile.get('local'),
  ])
  return {
    version: 1,
    app: 'vendas-beauty-brasil',
    exportedAt: new Date().toISOString(),
    clients,
    products,
    sales,
    payments,
    profile: profile ?? null,
  }
}

export function backupFileName(when = new Date()): string {
  const iso = when.toISOString().slice(0, 10)
  return `beauty-brasil-backup-${iso}.json`
}

export function serializeBackup(payload: BackupPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function parseBackup(raw: string): BackupPayload {
  const parsed = JSON.parse(raw) as Partial<BackupPayload>
  if (parsed.version !== 1 || parsed.app !== 'vendas-beauty-brasil') {
    throw new Error('Arquivo de backup inválido ou de outra versão')
  }
  if (
    !Array.isArray(parsed.clients) ||
    !Array.isArray(parsed.products) ||
    !Array.isArray(parsed.sales) ||
    !Array.isArray(parsed.payments)
  ) {
    throw new Error('Backup incompleto: faltam coleções obrigatórias')
  }
  return parsed as BackupPayload
}

export async function restoreBackup(payload: BackupPayload): Promise<void> {
  await db.transaction(
    'rw',
    db.clients,
    db.products,
    db.sales,
    db.payments,
    db.profile,
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.products.clear(),
        db.sales.clear(),
        db.payments.clear(),
        db.profile.clear(),
      ])
      if (payload.clients.length) await db.clients.bulkAdd(payload.clients)
      if (payload.products.length) await db.products.bulkAdd(payload.products)
      if (payload.sales.length) await db.sales.bulkAdd(payload.sales)
      if (payload.payments.length) await db.payments.bulkAdd(payload.payments)
      if (payload.profile) await db.profile.put(payload.profile)
    },
  )
}

async function writeBackupNative(filename: string, content: string): Promise<string> {
  await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Cache,
  })
  return uri
}

export async function downloadTextFile(filename: string, content: string, mime = 'application/json'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeBackupNative(filename, content)
    await Share.share({
      title: 'Backup Controle de Vendas',
      text: filename,
      files: [uri],
      dialogTitle: 'Salvar backup',
    })
    return
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function shareBackupFile(filename: string, content: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeBackupNative(filename, content)
    await Share.share({
      title: 'Backup Controle de Vendas',
      text: filename,
      files: [uri],
      dialogTitle: 'Enviar backup',
    })
    return true
  }
  const file = new File([content], filename, { type: 'application/json' })
  const payload = { files: [file], title: 'Backup Controle de Vendas', text: filename }
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  if (!nav.share || (nav.canShare && !nav.canShare(payload))) {
    return false
  }
  await nav.share(payload)
  return true
}
