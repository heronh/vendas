import { Capacitor, registerPlugin } from '@capacitor/core'

interface WifiInfoPlugin {
  getNetwork(): Promise<{ ssid: string | null; ipv4: string | null }>
  getTransport(): Promise<{ type: string }>
}

const WifiInfo = registerPlugin<WifiInfoPlugin>('WifiInfo')

export type NetworkTransport = 'wifi' | 'cellular' | 'none' | 'unknown'

function browserTransport(): NetworkTransport {
  if (typeof navigator === 'undefined' || !navigator.onLine) return 'none'
  const conn = (navigator as Navigator & { connection?: { type?: string } }).connection
  const type = conn?.type
  if (type === 'wifi' || type === 'ethernet') return 'wifi'
  if (type === 'cellular' || type === 'wimax') return 'cellular'
  if (type === 'none') return 'none'
  return 'unknown'
}

export async function getNetworkTransport(): Promise<NetworkTransport> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await WifiInfo.getTransport()
      if (info.type === 'wifi' || info.type === 'cellular' || info.type === 'none' || info.type === 'unknown') {
        return info.type
      }
    } catch {
      /* use browser fallback */
    }
  }
  return browserTransport()
}

async function getBrowserLocalIpv4(): Promise<string | null> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.createDataChannel('lan')
    let settled = false
    const finish = (ip: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      pc.close()
      resolve(ip)
    }
    const timer = window.setTimeout(() => finish(null), 1600)
    pc.onicecandidate = (event) => {
      const candidate = event.candidate?.candidate
      if (!candidate) return
      const match = candidate.match(/(\d+\.\d+\.\d+\.\d+)/)
      const ip = match?.[1]
      if (ip && !ip.startsWith('127.')) finish(ip)
    }
    void pc.createOffer().then((offer) => pc.setLocalDescription(offer))
  })
}

export async function getLocalNetwork(): Promise<{ ssid: string; ipv4: string | null }> {
  let ssid: string | null = null
  let ipv4: string | null = null
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await WifiInfo.getNetwork()
      ssid = info.ssid
      ipv4 = info.ipv4
    } catch {
      /* use fallbacks below */
    }
  }
  if (!ipv4) ipv4 = await getBrowserLocalIpv4()
  return {
    ssid: ssid?.trim() || 'Wi-Fi local',
    ipv4,
  }
}
