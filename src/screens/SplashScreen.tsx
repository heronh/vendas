import { Link } from 'react-router-dom'

export function SplashScreen() {
  return (
    <main className="splash">
      <div className="splash-kicker">Beauty Brasil SJC</div>
      <img className="splash-logo" src="/logo.jpeg" alt="Logo Beauty Brasil" />
      <h1>Controle de Vendas</h1>
      <p>Gestão Offline</p>
      <p className="muted">Estética e bem-estar · São José dos Campos</p>
      <div className="splash-actions">
        <Link to="/menu" className="btn btn-primary">
          Entrar
        </Link>
      </div>
    </main>
  )
}
