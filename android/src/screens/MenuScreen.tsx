import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MenuLink } from '../components/ui'
import { syncIfApproved } from '../services/lanSync'
import produtoIcon from '../../../docs/produto.svg'

export function MenuScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void syncIfApproved().then((result) => {
      if (cancelled) return
      if (result === 'reset') navigate('/cadastro', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <main>
      <header className="topbar">
        <span style={{ width: 42 }} />
        <h1>Menu Principal</h1>
        <span style={{ width: 42 }} />
      </header>
      <nav className="menu-list">
        <MenuLink
          to="/clientes/novo"
          icon="+"
          title="Cadastrar Cliente"
          subtitle="Nome, contato e endereço com CEP"
        />
        <MenuLink
          to="/produtos/novo"
          icon={<img src={produtoIcon} alt="" />}
          title="Cadastrar Produto"
          subtitle="Preços, código de barras e foto"
        />
        <MenuLink
          to="/clientes"
          icon="👥"
          title="Lista de Clientes"
          subtitle="Lançamentos, edição e conta corrente"
        />
        <MenuLink
          to="/relatorios"
          icon="📊"
          title="Relatórios"
          subtitle="Vendas, pagamentos e rankings"
        />
        <MenuLink
          to="/backup"
          icon="💾"
          title="Backup e sincronização"
          subtitle="Nuvem HTTPS, arquivo e restauração"
        />
        <MenuLink
          to="/perfil"
          icon="👤"
          title="Perfil"
          subtitle="E-mail do usuário e dados da clínica"
        />
        <MenuLink
          to="/ajuda"
          icon="?"
          title="Ajuda"
          subtitle="Veja o passo a passo animado"
        />
      </nav>
      <p className="brand-foot">Beauty Brasil SJC · Estética e Bem-Estar</p>
    </main>
  )
}
