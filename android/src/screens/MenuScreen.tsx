import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MenuLink } from '../components/ui'
import { getAppMode, licenseAllows, refreshAccountStatus } from '../services/appMode'
import { syncIfApproved } from '../services/lanSync'
import produtoIcon from '../../../docs/produto.svg'

export function MenuScreen() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(false)
  const [needPay, setNeedPay] = useState(false)
  const [signature, setSignature] = useState('')

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const mode = await getAppMode()
      if (cancelled) return
      setAdmin(mode?.mode === 'group' && mode.role === 'owner')
      setSignature(mode?.signature || '')
      setNeedPay(!licenseAllows(mode))
      if (mode && mode.mode !== 'stand_alone') {
        const result = await syncIfApproved()
        if (cancelled) return
        if (result === 'reset') {
          navigate('/cadastro', { replace: true })
          return
        }
        await refreshAccountStatus()
        const next = await getAppMode()
        if (cancelled) return
        setNeedPay(!licenseAllows(next))
        setAdmin(next?.mode === 'group' && next.role === 'owner')
        if (next && !licenseAllows(next) && next.mode === 'stand_alone') {
          navigate('/cobranca', { replace: true })
        }
      }
    }
    void boot()
    const timer = window.setInterval(() => {
      void syncIfApproved()
    }, 20000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
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
        {needPay ? (
          <MenuLink
            to="/cobranca"
            icon="!"
            title="Licença a regularizar"
            subtitle="Uso avulso aguarda cobrança no host"
          />
        ) : null}
        {admin ? (
          <MenuLink
            to="/administracao"
            icon="⚙"
            title="Administração do grupo"
            subtitle={signature ? `Assinatura ${signature}` : 'Membros e exclusão'}
          />
        ) : null}
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
          title="Backup"
          subtitle="Arquivo local ou nuvem, conforme o modo"
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
