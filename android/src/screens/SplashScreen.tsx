import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { connectAndSync } from '../services/lanSync'

export function SplashScreen() {
  const [phase, setPhase] = useState<'connecting' | 'ok' | 'error'>('connecting')
  const [message, setMessage] = useState('Conectando ao banco…')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const counts = await connectAndSync()
        if (cancelled) return
        setPhase('ok')
        setMessage(
          `Sincronizado com o banco: ${counts.clients} cliente(s), ${counts.products} produto(s) e ${counts.ledger} lançamento(s).`,
        )
      } catch (err) {
        if (cancelled) return
        setPhase('error')
        setMessage(err instanceof Error ? err.message : 'Falha ao conectar ao banco')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="splash">
      <div className="splash-kicker">Beauty Brasil SJC</div>
      <img className="splash-logo" src="/logo.jpeg" alt="Logo Beauty Brasil" />
      <h1>Controle de Vendas</h1>
      <p>Gestão Offline</p>
      <p className="muted">Estética e bem-estar · São José dos Campos</p>
      <p className={phase === 'error' ? 'error' : phase === 'ok' ? 'ok' : 'muted'} style={{ marginTop: 16 }}>
        {phase === 'connecting' ? 'Conectando ao banco…' : message}
      </p>
      <div className="splash-actions">
        <Link to="/menu" className="btn btn-primary">
          Entrar
        </Link>
      </div>
    </main>
  )
}
